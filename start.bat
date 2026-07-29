@echo off
title MNCU Bulk Mailer Server
echo ===================================================
echo   MNCU Bulk Mailer - Starting Local Node Server
echo ===================================================
echo.
cd /d "%~dp0"
if not exist "node_modules" (
    echo Installing dependencies...
    cmd /c npm install
)
echo Server is starting...
explorer "http://localhost:3000"
node server.js
pause
