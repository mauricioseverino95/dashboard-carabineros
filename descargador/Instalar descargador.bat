@echo off
title Instalar descargador - Carabineros de Chile
set "PS1=%~dp0instalar.ps1"
if exist "%PS1%" goto instalar
echo Descargando el instalador desde GitHub...
set "PS1=%TEMP%\instalar-descargador-carabineros.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/mauricioseverino95/dashboard-carabineros/main/descargador/instalar.ps1' -OutFile (Join-Path $env:TEMP 'instalar-descargador-carabineros.ps1')"
:instalar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
echo.
pause
