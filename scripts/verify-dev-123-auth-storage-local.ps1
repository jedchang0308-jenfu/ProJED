$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'output\qa\dev-123'
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$runtimeName = "projed-dev123-supabase-$([guid]::NewGuid().ToString('N'))"
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $runtimeName))
$runtimeSupabase = Join-Path $runtimeRoot 'supabase'
$startLog = Join-Path $runtimeRoot 'supabase-start.log'
$artifactPath = Join-Path $outputDirectory 'auth-storage-local-result.json'
$projectId = "ProJED_dev123_auth_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$started = $false
$result = $null

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  }
  finally {
    $listener.Stop()
  }
}

function Invoke-Supabase {
  param([Parameter(Mandatory = $true)][string[]]$Arguments, [switch]$Capture)
  if ($Capture) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $captured = (& npx.cmd supabase @Arguments 2>&1 | Out-String) }
    finally { $ErrorActionPreference = $previousErrorAction }
  }
  else {
    & npx.cmd supabase @Arguments
    $captured = ''
  }
  $script:lastSupabaseOutput = $captured
  if ($LASTEXITCODE -ne 0) { throw "supabase command failed: $($Arguments -join ' ')`n$captured" }
  if ($Capture) { return $captured }
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$apiPort = Get-FreeTcpPort
$dbPort = Get-FreeTcpPort
$shadowPort = Get-FreeTcpPort
$studioPort = Get-FreeTcpPort
$mailpitPort = Get-FreeTcpPort
$analyticsPort = Get-FreeTcpPort
Write-Output ("TEMP_SUPABASE project={0} purpose=DEV-123 authenticated DB/Storage local readback ports={1},{2},{3},{4} owner=supabase-cli/docker cleanup=after auth-storage gate" -f $runtimeRoot, $apiPort, $dbPort, $studioPort, $mailpitPort)

try {
  Copy-Item -LiteralPath (Join-Path $projectRoot 'supabase') -Destination $runtimeSupabase -Recurse -Force
  $configPath = Join-Path $runtimeSupabase 'config.toml'
  $config = Get-Content -Raw -LiteralPath $configPath
  $config = $config.Replace('project_id = "ProJED"', "project_id = `"$projectId`"")
  $config = $config.Replace('port = 54321', "port = $apiPort")
  $config = $config.Replace('port = 54322', "port = $dbPort")
  $config = $config.Replace('shadow_port = 54320', "shadow_port = $shadowPort")
  $config = $config.Replace('port = 54323', "port = $studioPort")
  $config = $config.Replace('port = 54324', "port = $mailpitPort")
  $config = $config.Replace('port = 54327', "port = $analyticsPort")
  Set-Content -LiteralPath $configPath -Value $config -Encoding UTF8

  $startArgs = @(
    'start', '--workdir', $runtimeRoot,
    '--exclude', 'realtime,imgproxy,studio,mailpit,edge-runtime,logflare,vector,supavisor',
    '--ignore-health-check', '--yes'
  )
  $startOutput = Invoke-Supabase -Arguments $startArgs -Capture
  Set-Content -LiteralPath $startLog -Value $startOutput -Encoding UTF8
  $started = $true
  $previousStatusErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $statusJson = (& npx.cmd supabase status --workdir $runtimeRoot --output json 2>$null | Out-String) }
  finally { $ErrorActionPreference = $previousStatusErrorAction }
  if ($LASTEXITCODE -ne 0) { throw "supabase status failed with exit code $LASTEXITCODE" }
  $status = $statusJson | ConvertFrom-Json
  $env:DEV123_LOCAL_SUPABASE_URL = [string]$status.API_URL
  $env:DEV123_LOCAL_SUPABASE_ANON_KEY = [string]$status.ANON_KEY
  $env:DEV123_LOCAL_SUPABASE_SERVICE_ROLE_KEY = [string]$status.SERVICE_ROLE_KEY
  & node.exe (Join-Path $projectRoot 'scripts\verify-dev-123-auth-storage-local.mjs')
  $nodeExitCode = $LASTEXITCODE
  if (Test-Path -LiteralPath $artifactPath) {
    $result = Get-Content -Raw -LiteralPath $artifactPath | ConvertFrom-Json
  }
  if ($nodeExitCode -ne 0 -or $null -eq $result -or $result.status -ne 'PASS') {
    throw "DEV-123 local authenticated DB/Storage verifier failed with exit code $nodeExitCode"
  }
}
catch {
  if ($null -eq $result) {
    $result = [ordered]@{
      devId = 'DEV-123'; status = 'FAIL'; environment = 'task-owned-local-supabase-auth-storage'
      cases = @(); failures = @('UNCAUGHT'); error = $_.Exception.Message; generatedAt = [DateTime]::UtcNow.ToString('o')
    }
  }
  else {
    $result.status = 'FAIL'
    $result.error = $_.Exception.Message
  }
  $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
  throw
}
finally {
  if ($started) {
    try { Invoke-Supabase -Arguments @('stop', '--workdir', $runtimeRoot, '--no-backup', '--yes') | Out-Null }
    catch { Write-Warning "Supabase stop failed: $($_.Exception.Message)" }
  }
  $portsReleased = @($apiPort, $dbPort, $studioPort, $mailpitPort) | ForEach-Object {
    -not (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue)
  } | Where-Object { -not $_ }
  $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeRoot)
  if (-not $resolvedRuntime.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove runtime outside temp root: $resolvedRuntime" }
  $removed = $true
  if ([System.IO.Directory]::Exists($resolvedRuntime)) {
    [System.IO.Directory]::Delete($resolvedRuntime, $true)
    $removed = -not [System.IO.Directory]::Exists($resolvedRuntime)
  }
  if ($null -ne $result -and (Test-Path -LiteralPath $artifactPath)) {
    $result | Add-Member -NotePropertyName runtime -NotePropertyValue ([ordered]@{
      projectId = $projectId; apiPort = $apiPort; dbPort = $dbPort; studioPort = $studioPort; mailpitPort = $mailpitPort
      portsReleased = ($portsReleased.Count -eq 0); pathRemoved = $removed
    }) -Force
    $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
  }
  Write-Output ("TEMP_SUPABASE_CLEANED ports={0},{1},{2},{3} released={4} path_removed={5}" -f $apiPort, $dbPort, $studioPort, $mailpitPort, ($portsReleased.Count -eq 0), $removed)
}

if ($null -eq $result -or $result.status -ne 'PASS') { exit 1 }
