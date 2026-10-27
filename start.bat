@echo off
cd /d "%~dp0"
title ONI Seed Scanner
node server.cjs
if errorlevel 1 (
  echo.
  echo Failed to start. Make sure Node.js is installed and run: npm install
  pause
)
