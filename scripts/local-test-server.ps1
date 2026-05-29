[CmdletBinding()]
param(
  [ValidateSet("start", "watch", "stop", "restart", "status", "install", "uninstall")]
  [string]$Action = "start",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$StateRoot = Join-Path $env:LOCALAPPDATA "ProJED\local-test-server"
$PidPath = Join-Path $StateRoot "dev-test-server.pid"
$WatchPidPath = Join-Path $StateRoot "dev-test-server-watch.pid"
$LogPath = Join-Path $StateRoot "dev-test-server.log"
$ControlLogPath = Join-Path $StateRoot "dev-test-server-control.log"
$WatchLogPath = Join-Path $StateRoot "dev-test-server-watch.log"
$WatchProcessLogPath = Join-Path $StateRoot "dev-test-server-watch-process.log"
$TaskName = "ProJED Local Test Server"
$StartupCommandPath = Join-Path ([Environment]::GetFolderPath("Startup")) "ProJED Local Test Server.cmd"
$Url = "http://${HostName}:${Port}/"

function Ensure-StateRoot {
  New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
}

function Get-Listener {
  try {
    Get-NetTCPConnection -LocalAddress $HostName -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
  } catch {
    $null
  }
}

function Get-CommandLine {
  param([int]$ProcessId)

  try {
    (Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId").CommandLine
  } catch {
    ""
  }
}

function Get-WrapperPid {
  if (-not (Test-Path $PidPath)) {
    return $null
  }

  $rawPid = (Get-Content $PidPath -ErrorAction SilentlyContinue | Select-Object -First 1)
  $parsedPid = 0
  if ([int]::TryParse($rawPid, [ref]$parsedPid)) {
    return $parsedPid
  }

  return $null
}

function Get-WatcherPid {
  if (-not (Test-Path $WatchPidPath)) {
    return $null
  }

  $rawPid = (Get-Content $WatchPidPath -ErrorAction SilentlyContinue | Select-Object -First 1)
  $parsedPid = 0
  if ([int]::TryParse($rawPid, [ref]$parsedPid)) {
    return $parsedPid
  }

  return $null
}

function Show-Status {
  $listener = Get-Listener
  $wrapperPid = Get-WrapperPid
  $watcherPid = Get-WatcherPid
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

  if ($listener) {
    $ownerPid = [int]$listener.OwningProcess
    Write-Host "RUNNING $Url"
    Write-Host "listener_pid=$ownerPid"
    Write-Host "listener_command=$(Get-CommandLine -ProcessId $ownerPid)"
  } else {
    Write-Host "STOPPED $Url"
  }

  if ($wrapperPid) {
    $wrapper = Get-Process -Id $wrapperPid -ErrorAction SilentlyContinue
    if ($wrapper) {
      Write-Host "wrapper_pid=$wrapperPid"
    } else {
      Write-Host "wrapper_pid=$wrapperPid (stale)"
    }
  }

  if ($watcherPid) {
    $watcher = Get-Process -Id $watcherPid -ErrorAction SilentlyContinue
    if ($watcher) {
      Write-Host "watcher_pid=$watcherPid"
    } else {
      Write-Host "watcher_pid=$watcherPid (stale)"
    }
  }

  if ($task) {
    Write-Host "scheduled_task=installed state=$($task.State)"
  } else {
    Write-Host "scheduled_task=not_installed"
  }

  if (Test-Path $StartupCommandPath) {
    Write-Host "startup_command=installed path=$StartupCommandPath"
  } else {
    Write-Host "startup_command=not_installed"
  }

  Write-Host "log=$LogPath"
  Write-Host "control_log=$ControlLogPath"
  Write-Host "watch_log=$WatchLogPath"
  Write-Host "watch_process_log=$WatchProcessLogPath"
}

function Start-Server {
  Ensure-StateRoot

  $listener = Get-Listener
  if ($listener) {
    Write-Host "RUNNING $Url"
    Write-Host "listener_pid=$($listener.OwningProcess)"
    return
  }

  $stamp = Get-Date -Format "o"
  Add-Content -Path $ControlLogPath -Value "[$stamp] Starting ProJED local test server from $ProjectRoot"

  $command = "set `"VITE_DATA_BACKEND=local-test`" && npm.cmd run dev:test >> `"$LogPath`" 2>&1"
  $process = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList @("/d", "/c", $command) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -Path $PidPath -Value $process.Id

  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    $listener = Get-Listener
    if ($listener) {
      Write-Host "STARTED $Url"
      Write-Host "listener_pid=$($listener.OwningProcess)"
      Write-Host "wrapper_pid=$($process.Id)"
      Write-Host "log=$LogPath"
      return
    }
  }

  Write-Host "FAILED_TO_START $Url"
  if (Test-Path $LogPath) {
    Get-Content $LogPath -Tail 80
  }
  exit 1
}

function Stop-Server {
  Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -like "*local-test-server.ps1* watch*" } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

  $watcherPid = Get-WatcherPid
  if ($watcherPid) {
    Stop-Process -Id $watcherPid -Force -ErrorAction SilentlyContinue
  }

  $listener = Get-Listener
  if ($listener) {
    Stop-Process -Id ([int]$listener.OwningProcess) -Force -ErrorAction SilentlyContinue
  }

  $wrapperPid = Get-WrapperPid
  if ($wrapperPid) {
    Stop-Process -Id $wrapperPid -Force -ErrorAction SilentlyContinue
  }

  Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
  Remove-Item $WatchPidPath -Force -ErrorAction SilentlyContinue
  Write-Host "STOPPED $Url"
}

function Watch-Server {
  Ensure-StateRoot
  Set-Content -Path $WatchPidPath -Value $PID
  Add-Content -Path $WatchLogPath -Value "[$(Get-Date -Format "o")] Watcher started. Monitoring $Url"

  while ($true) {
    if (-not (Get-Listener)) {
      Add-Content -Path $WatchLogPath -Value "[$(Get-Date -Format "o")] Listener missing. Restarting server."
      Start-Server
    }

    Start-Sleep -Seconds 30
  }
}

function Start-Watcher {
  Ensure-StateRoot

  $watcherPid = Get-WatcherPid
  if ($watcherPid -and (Get-Process -Id $watcherPid -ErrorAction SilentlyContinue)) {
    Write-Host "WATCHER_RUNNING $Url"
    Write-Host "watcher_pid=$watcherPid"
    return
  }

  $watchCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" watch >> `"$WatchProcessLogPath`" 2>&1"
  $process = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList @("/d", "/c", $watchCommand) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -Path $WatchPidPath -Value $process.Id
  Write-Host "WATCHER_STARTED $Url"
  Write-Host "watcher_pid=$($process.Id)"
}

function Install-LoginTask {
  Ensure-StateRoot

  $powershellPath = (Get-Command powershell.exe).Source
  $argument = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" watch"
  $action = New-ScheduledTaskAction -Execute $powershellPath -Argument $argument -WorkingDirectory $ProjectRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

  try {
    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $action `
      -Trigger $trigger `
      -Settings $settings `
      -Description "Keeps the ProJED Vite test server available at $Url after Windows sign-in." `
      -Force | Out-Null

    Write-Host "INSTALLED scheduled task: $TaskName"
  } catch {
    Write-Host "SCHEDULED_TASK_INSTALL_FAILED $($_.Exception.Message)"
    Install-StartupCommand
  }

  Start-Watcher
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    $listener = Get-Listener
    if ($listener) {
      Write-Host "RUNNING $Url"
      Write-Host "listener_pid=$($listener.OwningProcess)"
      return
    }
  }

  Start-Server
}

function Install-StartupCommand {
  $content = @"
@echo off
cd /d "$ProjectRoot"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSCommandPath" watch
"@

  Set-Content -Path $StartupCommandPath -Value $content -Encoding ASCII
  Write-Host "INSTALLED startup command: $StartupCommandPath"
}

function Uninstall-LoginTask {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item $StartupCommandPath -Force -ErrorAction SilentlyContinue
  Write-Host "UNINSTALLED scheduled task: $TaskName"
  Write-Host "UNINSTALLED startup command: $StartupCommandPath"
}

switch ($Action) {
  "start" { Start-Server }
  "watch" { Watch-Server }
  "stop" { Stop-Server }
  "restart" {
    Stop-Server
    Start-Watcher
    Start-Server
  }
  "status" { Show-Status }
  "install" { Install-LoginTask }
  "uninstall" { Uninstall-LoginTask }
}
