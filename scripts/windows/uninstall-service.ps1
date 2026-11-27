# Stops and removes the scheduled task. Your chats (data\) and login (auth\) are kept.
$TaskName = 'ETEA-WhatsApp-Bot'
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*src\index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed '$TaskName'."
