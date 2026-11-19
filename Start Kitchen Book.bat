@echo off
title Little Kitchen Book
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Kitchen Book needs Node.js to run on this PC.
  echo   Install the LTS version from https://nodejs.org, then open this file again.
  echo.
  pause
  exit /b 1
)
node server.js
pause
