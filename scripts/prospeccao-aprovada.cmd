@echo off
setlocal
cd /d "%~dp0.."
node scripts\dispatch-approved-batch.mjs --date=%~1 --slot=%~2 >> "logs\prospecting-batches\%~1-%~2.task.log" 2>&1
exit /b %errorlevel%
