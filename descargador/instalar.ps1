# Instalador del Descargador local - Centro de Monitoreo de Medios, Carabineros de Chile
# Descarga yt-dlp y ffmpeg (desde sus paginas oficiales en GitHub), deja el descargador
# funcionando en segundo plano y lo inicia automaticamente con Windows.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Origen = if ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { '' }
$Destino = Join-Path $env:LOCALAPPDATA 'DescargadorCarabineros'
$Bin = Join-Path $Destino 'bin'
$Inicio = [Environment]::GetFolderPath('Startup')
$Lanzador = Join-Path $Inicio 'Descargador Carabineros.vbs'

function Paso($t) { Write-Host ''; Write-Host ('>> ' + $t) -ForegroundColor Green }

Write-Host '==============================================================' -ForegroundColor DarkGreen
Write-Host '   Descargador de videos - Carabineros de Chile (yt-dlp)' -ForegroundColor Yellow
Write-Host '==============================================================' -ForegroundColor DarkGreen

try {
Paso 'Deteniendo una version anterior (si existe)...'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*DescargadorCarabineros*servidor.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

New-Item -ItemType Directory -Force -Path $Bin | Out-Null
$Raw = 'https://raw.githubusercontent.com/mauricioseverino95/dashboard-carabineros/main/descargador/'
if ($Origen -and (Test-Path (Join-Path $Origen 'servidor.ps1'))) {
    Copy-Item -Path (Join-Path $Origen 'servidor.ps1') -Destination $Destino -Force
} else {
    Paso 'Descargando el programa del descargador...'
    Invoke-WebRequest -UseBasicParsing -Uri ($Raw + 'servidor.ps1') -OutFile (Join-Path $Destino 'servidor.ps1')
}

Paso 'Descargando yt-dlp (github.com/yt-dlp/yt-dlp)...'
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile (Join-Path $Bin 'yt-dlp.exe')

if (-not (Test-Path (Join-Path $Bin 'ffmpeg.exe'))) {
    Paso 'Descargando ffmpeg (github.com/yt-dlp/FFmpeg-Builds, ~150 MB, puede tardar unos minutos)...'
    $zip = Join-Path $env:TEMP 'ffmpeg-dc.zip'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile $zip
    $tmp = Join-Path $env:TEMP 'ffmpeg-dc'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    Get-ChildItem $tmp -Recurse -Include 'ffmpeg.exe', 'ffprobe.exe' | Copy-Item -Destination $Bin -Force
    Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
} else { Paso 'ffmpeg ya estaba instalado.' }
Get-ChildItem $Destino -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

Paso 'Configurando el inicio automatico con Windows...'
$cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + (Join-Path $Destino 'servidor.ps1') + '""'
$vbs = 'CreateObject("WScript.Shell").Run "' + $cmd + '", 0, False'
Set-Content -Path $Lanzador -Value $vbs -Encoding ASCII

Paso 'Iniciando el descargador...'
Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $Lanzador + '"')
$ok = $false
for ($i = 0; $i -lt 15 -and -not $ok; $i++) {
    Start-Sleep -Seconds 1
    try { $r = Invoke-RestMethod -Uri 'http://localhost:8737/ping' -TimeoutSec 2; $ok = $r.ok } catch { }
}
Write-Host ''
if ($ok) {
    Write-Host 'LISTO. El descargador esta funcionando.' -ForegroundColor Green
    Write-Host ('Los videos se guardan en: ' + $r.carpeta) -ForegroundColor Yellow
    Write-Host 'Vuelva al dashboard y recargue la pagina: en Videos y camaras > Descargas'
    Write-Host 'aparecera "Descargador de este PC conectado". Si Chrome pregunta si el sitio'
    Write-Host 'puede acceder a otros dispositivos o aplicaciones de este equipo, elija "Permitir".'
} else {
    Write-Host 'El descargador no respondio. Revise el archivo:' -ForegroundColor Red
    Write-Host (Join-Path $Destino 'descargador.log')
}
} catch {
    Write-Host ''
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Revise su conexion a internet y vuelva a ejecutar el instalador.' -ForegroundColor Yellow
}
