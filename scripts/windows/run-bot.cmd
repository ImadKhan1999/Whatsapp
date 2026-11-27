@echo off
rem Runs the bot from the repo folder and appends its output to data\logs\bot.log.
rem Used by the scheduled task; you can also double-click it.
cd /d "%~dp0\..\.."
if not exist data\logs mkdir data\logs
node --disable-warning=ExperimentalWarning src\index.js >> data\logs\bot.log 2>&1
