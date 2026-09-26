param(
    [string]$OutputDirectory = 'dist-zip'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$stagingPath = Join-Path $projectRoot 'dist-zotero'
$outputPath = Join-Path $projectRoot $OutputDirectory

if (-not (Test-Path -LiteralPath $stagingPath)) {
    throw "Staging directory does not exist: $stagingPath"
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$manifest = Get-Content -LiteralPath (Join-Path $stagingPath 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
$xpiName = "todolist-zotero-$($manifest.version).xpi"
$xpiPath = Join-Path $outputPath $xpiName

if (Test-Path -LiteralPath $xpiPath) {
    Remove-Item -LiteralPath $xpiPath -Force
}

$archive = [System.IO.Compression.ZipFile]::Open($xpiPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $files = Get-ChildItem -LiteralPath $stagingPath -Recurse -File
    foreach ($file in $files) {
        $fullPath = $file.FullName
        $relative = $fullPath.Substring($stagingPath.Length).TrimStart('\', '/').Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $fullPath,
            $relative,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $archive.Dispose()
}

$stagingXpi = Join-Path $stagingPath $xpiName
Copy-Item -LiteralPath $xpiPath -Destination $stagingXpi -Force

$stream = [System.IO.File]::OpenRead($xpiPath)
$hasher = [System.Security.Cryptography.SHA256]::Create()
$hashBytes = $hasher.ComputeHash($stream)
$stream.Dispose()
$hash = [System.BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant()
$sizeKb = [Math]::Round(((Get-Item -LiteralPath $xpiPath).Length / 1024), 2)

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "✅ Zotero 插件打包成功: $xpiName" -ForegroundColor Green
Write-Host "📂 输出路径: $xpiPath" -ForegroundColor White
Write-Host "📏 文件大小: $sizeKb KB" -ForegroundColor Yellow
Write-Host "🔐 SHA-256: $hash" -ForegroundColor Magenta
Write-Host "======================================================" -ForegroundColor Cyan
