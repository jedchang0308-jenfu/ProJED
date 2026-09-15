$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'output\qa\dev-123'
$artifactPath = Join-Path $outputDirectory 'control-api-local-result.json'
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$runtimeName = "projed-dev123-control-api-$([guid]::NewGuid().ToString('N'))"
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $runtimeName))
$runtimeSupabase = Join-Path $runtimeRoot 'supabase'
$projectId = "ProJED_dev123_control_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$started = $false
$result = $null

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try { $listener.Start(); return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
  finally { $listener.Stop() }
}

function Invoke-Supabase {
  param([Parameter(Mandatory = $true)][string[]]$Arguments, [switch]$Capture)
  if ($Capture) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $captured = (& npx.cmd supabase @Arguments 2>&1 | Out-String) }
    finally { $ErrorActionPreference = $previous }
  }
  else { & npx.cmd supabase @Arguments; $captured = '' }
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
$edgeSecretKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
Write-Output ("TEMP_SUPABASE project={0} purpose=DEV-123 authenticated control API/Storage local readback ports={1},{2} owner=supabase-cli/docker cleanup=after control-api gate" -f $runtimeRoot, $apiPort, $dbPort)

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
  $config += "`r`n[edge_runtime.secrets]`r`nDEV123_LOCAL_EDGE_RUNTIME = `"true`"`r`nDEV123_LOCAL_EDGE_SERVICE_KEY = `"$edgeSecretKey`"`r`nDEV123_PROVIDER_MODE = `"fake`"`r`nDEV123_WORKER_SECRET = `"dev123-local-worker`"`r`nDEV123_PURGE_SECRET = `"dev123-local-purge`"`r`n"
  Set-Content -LiteralPath $configPath -Value $config -Encoding UTF8

  $startOutput = Invoke-Supabase -Arguments @('start', '--workdir', $runtimeRoot, '--exclude', 'realtime,imgproxy,studio,mailpit,logflare,vector,supavisor', '--ignore-health-check', '--yes') -Capture
  Set-Content -LiteralPath (Join-Path $runtimeRoot 'supabase-start.log') -Value $startOutput -Encoding UTF8
  $started = $true
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $statusJson = (& npx.cmd supabase status --workdir $runtimeRoot --output json 2>$null | Out-String) }
  finally { $ErrorActionPreference = $previous }
  if ($LASTEXITCODE -ne 0) { throw "supabase status failed with exit code $LASTEXITCODE" }
  $status = $statusJson | ConvertFrom-Json
  $env:DEV123_LOCAL_SUPABASE_URL = [string]$status.API_URL
  $env:DEV123_LOCAL_SUPABASE_ANON_KEY = [string]$status.ANON_KEY
  $env:DEV123_LOCAL_SUPABASE_SERVICE_ROLE_KEY = [string]$status.SERVICE_ROLE_KEY
  & node.exe (Join-Path $projectRoot 'scripts\verify-dev-123-control-api-local.mjs')
  $nodeExitCode = $LASTEXITCODE
  if (Test-Path -LiteralPath $artifactPath) { $result = Get-Content -Raw -LiteralPath $artifactPath | ConvertFrom-Json }
  if ($nodeExitCode -ne 0 -or $null -eq $result -or $result.status -ne 'PASS') { throw "DEV-123 local control API verifier failed with exit code $nodeExitCode" }
}
catch {
  Write-Output 'EDGE_RUNTIME_DEBUG:'
  $edgeContainers = @(docker ps -a --format '{{.Names}}' | Where-Object { $_ -match [regex]::Escape($projectId) -or $_ -match 'edge_runtime|edge-runtime' })
  foreach ($edgeContainer in $edgeContainers) { Write-Output ("CONTAINER={0}" -f $edgeContainer); docker logs --tail 160 $edgeContainer 2>&1 }
  if ($null -eq $result) { $result = [ordered]@{ devId = 'DEV-123'; status = 'FAIL'; environment = 'task-owned-local-supabase-control-api-edge'; cases = @(); failures = @('UNCAUGHT'); error = $_.Exception.Message; generatedAt = [DateTime]::UtcNow.ToString('o') } }
  else {
    $result.status = 'FAIL'
    $result | Add-Member -NotePropertyName error -NotePropertyValue $_.Exception.Message -Force
  }
  $result | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
  throw
}
finally {
  if ($started) {
    try { Invoke-Supabase -Arguments @('stop', '--workdir', $runtimeRoot, '--no-backup', '--yes') | Out-Null }
    catch { Write-Warning "Supabase stop failed: $($_.Exception.Message)" }
  }
  $ports = @($apiPort, $dbPort, $studioPort, $mailpitPort, $analyticsPort)
  $portsReleased = $ports | ForEach-Object { -not (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue) } | Where-Object { -not $_ }
  $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeRoot)
  if (-not $resolvedRuntime.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove runtime outside temp root: $resolvedRuntime" }
  $removed = $true
  if ([System.IO.Directory]::Exists($resolvedRuntime)) { [System.IO.Directory]::Delete($resolvedRuntime, $true); $removed = -not [System.IO.Directory]::Exists($resolvedRuntime) }
  if ($null -ne $result -and (Test-Path -LiteralPath $artifactPath)) {
    $result | Add-Member -NotePropertyName runtime -NotePropertyValue ([ordered]@{ projectId = $projectId; apiPort = $apiPort; dbPort = $dbPort; studioPort = $studioPort; mailpitPort = $mailpitPort; analyticsPort = $analyticsPort; portsReleased = ($portsReleased.Count -eq 0); pathRemoved = $removed }) -Force
    $result | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
  }
  Write-Output ("TEMP_SUPABASE_CLEANED ports_released={0} path_removed={1}" -f ($portsReleased.Count -eq 0), $removed)
}

if ($null -eq $result -or $result.status -ne 'PASS') { exit 1 }
