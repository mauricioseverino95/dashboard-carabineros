# Descargador local para el Centro de Monitoreo de Medios - Carabineros de Chile
# Usa yt-dlp (https://github.com/yt-dlp/yt-dlp) y ffmpeg en ESTE computador, asi YouTube
# no bloquea la descarga (como si pasa desde servidores en la nube).
# El dashboard le envia los enlaces a http://localhost:8737 y muestra el avance.
# Compatible con Windows PowerShell 5.1.

param([int]$Puerto = 8737)

$ErrorActionPreference = 'Continue'
$Version = '1.0'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$EsWindows = ($env:OS -eq 'Windows_NT')
$ExeExt = if ($EsWindows) { '.exe' } else { '' }

$YtDlp = if ($env:DC_YTDLP) { $env:DC_YTDLP } else { Join-Path $Base ('bin\yt-dlp' + $ExeExt) }
$FfmpegDir = if ($env:DC_FFMPEG_DIR) { $env:DC_FFMPEG_DIR } else { Join-Path $Base 'bin' }
$Ffmpeg = Join-Path $FfmpegDir ('ffmpeg' + $ExeExt)
$Salida = if ($env:DC_SALIDA) { $env:DC_SALIDA } else {
    Join-Path (Join-Path $env:USERPROFILE 'Downloads') 'Carabineros - Videos'
}
$Trabajos = Join-Path $Base 'trabajos'

# Solo el dashboard puede pedir descargas (evita que otra pagina web use este programa)
$OrigenesPermitidos = @('https://mauricioseverino95.github.io')
if ($env:DC_ORIGEN_EXTRA) { $OrigenesPermitidos += $env:DC_ORIGEN_EXTRA }

New-Item -ItemType Directory -Force -Path $Salida, $Trabajos | Out-Null

function Escribir-Log($t) {
    $linea = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $t
    Add-Content -Path (Join-Path $Base 'descargador.log') -Value $linea -Encoding UTF8
}

# ------------------------------------------------------------------ trabajo de descarga
# Corre en segundo plano (Start-Job): descarga con yt-dlp y comprime con ffmpeg para WhatsApp.
$TrabajoScript = {
    param($Dir, $Url, $Titulo, $Canal, $Publicado, $YtDlp, $FfmpegDir, $Ffmpeg, $Salida)
    $ErrorActionPreference = 'Continue'
    function Estado($e, $msg, $extra) {
        $o = @{ estado = $e; msg = $msg; t = (Get-Date).ToString('o') }
        if ($extra) { foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] } }
        ($o | ConvertTo-Json -Compress) | Set-Content -Path (Join-Path $Dir 'estado.json') -Encoding UTF8
    }
    function Limpio($s, $n) {
        $s = ($s -replace '[\\/:*?"<>|\r\n\t]', ' ' -replace '\s+', ' ').Trim()
        if ($s.Length -gt $n) { $s = $s.Substring(0, $n).Trim() }
        return $s
    }
    try {
        Estado 'descargando' 'Descargando con yt-dlp...' $null
        $log = Join-Path $Dir 'descarga.log'
        $args1 = @('--no-playlist', '--newline', '--no-mtime', '--no-part',
                   '-f', 'bv*[height<=480][vcodec^=avc1]+ba[ext=m4a]/b[height<=480][ext=mp4]/bv*[height<=480]+ba/b[height<=480]/b',
                   '--merge-output-format', 'mp4', '--ffmpeg-location', $FfmpegDir,
                   '--write-info-json', '-o', (Join-Path $Dir 'in.%(ext)s'), $Url)
        & $YtDlp @args1 *>> $log
        $video = Get-ChildItem -Path $Dir -File | Where-Object { $_.Name -like 'in.*' -and $_.Extension -notin '.json', '.part', '.ytdl' } | Select-Object -First 1
        if (-not $video) {
            $ult = (Get-Content $log -Tail 4 -ErrorAction SilentlyContinue) -join ' '
            Estado 'error' ('No se pudo descargar: ' + ($ult -replace '^.*ERROR:\s*', '').Substring(0, [Math]::Min(180, ($ult -replace '^.*ERROR:\s*', '').Length))) $null
            return
        }
        $info = $null
        $ij = Join-Path $Dir 'in.info.json'
        if (Test-Path $ij) { try { $info = Get-Content $ij -Raw -Encoding UTF8 | ConvertFrom-Json } catch { } }
        if (-not $Titulo -and $info) { $Titulo = $info.title }
        if (-not $Canal -and $info) { $Canal = $info.uploader }
        $dur = 0; if ($info -and $info.duration) { $dur = [double]$info.duration }

        $fecha = Get-Date
        if ($Publicado) { try { $fecha = [datetime]::Parse($Publicado).ToLocalTime() } catch { } }
        $nombre = (Get-Date $fecha -Format 'yyyyMMdd-HHmm') + ' - ' + (Limpio $Canal 30) + ' - ' + (Limpio $Titulo 80) + '.mp4'
        $nombre = $nombre -replace ' - +- ', ' - '
        $destino = Join-Path $Salida $nombre

        # Comprimir para WhatsApp: 480p, H.264, audio AAC, inicio rapido
        Estado 'comprimiendo' 'Comprimiendo para WhatsApp...' @{ duracion = $dur }
        $prog = Join-Path $Dir 'ffmpeg.progress'
        $args2 = @('-y', '-hide_banner', '-loglevel', 'error', '-i', $video.FullName,
                   '-vf', "scale=-2:'min(480,ih)':flags=bicubic,format=yuv420p",
                   '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '900k', '-bufsize', '1800k',
                   '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart',
                   '-progress', $prog, '-nostats', (Join-Path $Dir 'out.mp4'))
        & $Ffmpeg @args2 *>> (Join-Path $Dir 'ffmpeg.log')
        $out = Join-Path $Dir 'out.mp4'
        if (-not (Test-Path $out) -or (Get-Item $out).Length -lt 1000) {
            Copy-Item $video.FullName $out -Force          # si falla la compresion, entregar el original
        }
        Move-Item -Path $out -Destination $destino -Force
        $tam = (Get-Item $destino).Length
        Estado 'listo' 'Listo para WhatsApp' @{ archivo = $destino; nombre = $nombre; tam = $tam; duracion = $dur }
        Get-ChildItem -Path $Dir -File | Where-Object { $_.Name -like 'in.*' } | Remove-Item -Force -ErrorAction SilentlyContinue
    } catch {
        Estado 'error' ('Error: ' + $_.Exception.Message) $null
    }
}

$Jobs = @{}

function Nuevo-Trabajo($d) {
    $id = (Get-Date -Format 'yyyyMMddHHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 6))
    $dir = Join-Path $Trabajos $id
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $meta = @{ id = $id; url = $d.url; titulo = $d.title; canal = $d.channel; publicado = $d.published;
               ref = $d.ref; creado = (Get-Date).ToString('o') }
    ($meta | ConvertTo-Json -Compress) | Set-Content -Path (Join-Path $dir 'meta.json') -Encoding UTF8
    (@{ estado = 'en cola'; msg = 'En cola...' } | ConvertTo-Json -Compress) | Set-Content -Path (Join-Path $dir 'estado.json') -Encoding UTF8
    $Jobs[$id] = Start-Job -ScriptBlock $TrabajoScript -ArgumentList $dir, $d.url, $d.title, $d.channel, $d.published, $YtDlp, $FfmpegDir, $Ffmpeg, $Salida
    Escribir-Log ('descarga ' + $id + '  ' + $d.url)
    return $id
}

function Leer-Estado($dir) {
    $meta = Get-Content (Join-Path $dir 'meta.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $est = Get-Content (Join-Path $dir 'estado.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $pct = 2
    if ($est.estado -eq 'descargando') {
        $log = Join-Path $dir 'descarga.log'
        if (Test-Path $log) {
            $m = Select-String -Path $log -Pattern '\[download\]\s+([\d\.]+)%' | Select-Object -Last 1
            if ($m) { $pct = [int](5 + 0.7 * [double]$m.Matches[0].Groups[1].Value) } else { $pct = 5 }
        }
    } elseif ($est.estado -eq 'comprimiendo') {
        $pct = 76
        $pf = Join-Path $dir 'ffmpeg.progress'
        if ((Test-Path $pf) -and $est.duracion -gt 0) {
            $m = Select-String -Path $pf -Pattern '^out_time_ms=(\d+)' | Select-Object -Last 1
            if ($m) { $pct = [int](76 + 23 * [Math]::Min(1, ([double]$m.Matches[0].Groups[1].Value / 1000000) / $est.duracion)) }
        }
    } elseif ($est.estado -eq 'listo') { $pct = 100 }
    $id = Split-Path $dir -Leaf
    return [ordered]@{ id = $id; url = $meta.url; titulo = $meta.titulo; canal = $meta.canal; ref = $meta.ref;
                       creado = $meta.creado; estado = $est.estado; msg = $est.msg; pct = $pct;
                       archivo = $est.archivo; nombre = $est.nombre; tam = $est.tam; duracion = $est.duracion }
}

function Responder($ctx, $codigo, $obj) {
    $res = $ctx.Response
    $origen = $ctx.Request.Headers['Origin']
    if ($origen -and ($OrigenesPermitidos -contains $origen)) {
        $res.AddHeader('Access-Control-Allow-Origin', $origen)
        $res.AddHeader('Vary', 'Origin')
    }
    $res.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type')
    $res.AddHeader('Access-Control-Allow-Private-Network', 'true')
    $res.StatusCode = $codigo
    $res.ContentType = 'application/json; charset=utf-8'
    $json = if ($obj -ne $null) { $obj | ConvertTo-Json -Depth 5 -Compress } else { '{}' }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Close()
}

# ------------------------------------------------------------------ servidor HTTP
$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$Puerto/")
try { $http.Start() } catch {
    Escribir-Log ('No se pudo abrir el puerto ' + $Puerto + ': ' + $_.Exception.Message)
    exit 1
}
# Mantener yt-dlp al dia (YouTube cambia seguido y las versiones viejas dejan de funcionar)
if (Test-Path $YtDlp) { Start-Job -ScriptBlock { param($y) & $y -U *> $null } -ArgumentList $YtDlp | Out-Null }

Escribir-Log ("Descargador $Version escuchando en http://localhost:$Puerto  (carpeta: $Salida)")
Write-Host "Descargador Carabineros escuchando en http://localhost:$Puerto"

while ($http.IsListening) {
    try { $ctx = $http.GetContext() } catch { break }
    try {
        $req = $ctx.Request
        $origen = $req.Headers['Origin']
        if ($origen -and -not ($OrigenesPermitidos -contains $origen)) { Responder $ctx 403 @{ error = 'origen no permitido' }; continue }
        if ($req.HttpMethod -eq 'OPTIONS') { Responder $ctx 200 $null; continue }
        $ruta = $req.Url.AbsolutePath.TrimEnd('/')

        if ($ruta -eq '/ping') {
            $v = ''; try { $v = (& $YtDlp --version 2>$null | Select-Object -First 1) } catch { }
            Responder $ctx 200 @{ ok = $true; version = $Version; ytdlp = $v; carpeta = $Salida }
        }
        elseif ($ruta -eq '/descargar' -and $req.HttpMethod -eq 'POST') {
            $sr = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $d = $sr.ReadToEnd() | ConvertFrom-Json
            if (-not $d.url -or $d.url -notmatch '^https?://') { Responder $ctx 400 @{ error = 'enlace no valido' }; continue }
            # no repetir una descarga en curso o ya lista del mismo enlace
            $previo = Get-ChildItem $Trabajos -Directory | Sort-Object Name -Descending | ForEach-Object { Leer-Estado $_.FullName } |
                      Where-Object { $_.url -eq $d.url -and $_.estado -ne 'error' } | Select-Object -First 1
            if ($previo) { Responder $ctx 200 @{ id = $previo.id; repetido = $true }; continue }
            $id = Nuevo-Trabajo $d
            Responder $ctx 200 @{ id = $id }
        }
        elseif ($ruta -eq '/estado') {
            $lista = @(Get-ChildItem $Trabajos -Directory | Sort-Object Name -Descending | Select-Object -First 40 | ForEach-Object { Leer-Estado $_.FullName })
            Responder $ctx 200 @{ trabajos = $lista; carpeta = $Salida }
        }
        elseif ($ruta -eq '/abrir') {
            $id = $req.QueryString['id']
            $dir = Join-Path $Trabajos ($id -replace '[^\w\-]', '')
            if ($id -and (Test-Path (Join-Path $dir 'estado.json'))) {
                $e = Leer-Estado $dir
                if ($EsWindows -and $e.archivo -and (Test-Path $e.archivo)) { Start-Process explorer.exe ('/select,"' + $e.archivo + '"') }
                Responder $ctx 200 @{ ok = $true }
            } else { Responder $ctx 404 @{ error = 'no existe' } }
        }
        elseif ($ruta -eq '/carpeta') {
            if ($EsWindows) { Start-Process explorer.exe ('"' + $Salida + '"') }
            Responder $ctx 200 @{ ok = $true }
        }
        elseif ($ruta -eq '/actualizar' -and $req.HttpMethod -eq 'POST') {
            $r = (& $YtDlp -U 2>&1 | Out-String)
            Responder $ctx 200 @{ ok = $true; salida = $r.Trim() }
        }
        else { Responder $ctx 404 @{ error = 'ruta desconocida' } }
    } catch {
        Escribir-Log ('error: ' + $_.Exception.Message)
        try { Responder $ctx 500 @{ error = $_.Exception.Message } } catch { }
    }
    # limpiar trabajos terminados de la memoria
    foreach ($k in @($Jobs.Keys)) {
        if ($Jobs[$k].State -ne 'Running') {
            $ef = Join-Path (Join-Path $Trabajos $k) 'estado.json'
            try {
                $e = Get-Content $ef -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($e.estado -in 'en cola', 'descargando', 'comprimiendo') {
                    (@{ estado = 'error'; msg = 'La descarga se detuvo inesperadamente.' } | ConvertTo-Json -Compress) | Set-Content -Path $ef -Encoding UTF8
                }
            } catch { }
            Remove-Job $Jobs[$k] -Force -ErrorAction SilentlyContinue; $Jobs.Remove($k)
        }
    }
}
