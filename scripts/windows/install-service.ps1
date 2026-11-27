# Installs the bot as a Windows scheduled task that starts at boot (before anyone logs in)
# and restarts automatically if it stops. Run in an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install-service.ps1
# Link WhatsApp FIRST (npm start, scan the QR, Ctrl+C), so the auth folder exists.
$ErrorActionPreference = 'Stop'
$TaskName = 'ETEA-WhatsApp-Bot'
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Cmd  = Join-Path $Root 'scripts\windows\run-bot.cmd'

if (-not (Test-Path (Join-Path $Root 'auth\creds.json'))) {
  Write-Warning "No WhatsApp session found in $Root\auth. Run 'npm start' once and link the number first."
}

$action    = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$Cmd`"" -WorkingDirectory $Root
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
              -MultipleInstances IgnoreNew -StartWhenAvailable

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed and started '$TaskName'. Logs: $Root\data\logs\bot.log"
Write-Host "Stop:  Stop-ScheduledTask -TaskName $TaskName   (or scripts\windows\uninstall-service.ps1 to remove it)"
