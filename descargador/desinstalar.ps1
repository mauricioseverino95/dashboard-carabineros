# Desinstala el Descargador local (los videos ya descargados NO se borran)
$Destino = Join-Path $env:LOCALAPPDATA 'DescargadorCarabineros'
$Lanzador = Join-Path ([Environment]::GetFolderPath('Startup')) 'Descargador Carabineros.vbs'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*DescargadorCarabineros*servidor.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
Remove-Item $Lanzador -Force -ErrorAction SilentlyContinue
Remove-Item $Destino -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Descargador desinstalado. Sus videos siguen en Descargas\Carabineros - Videos.' -ForegroundColor Green
