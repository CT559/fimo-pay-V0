# inject-logo.ps1 — Nhúng logo thật vào FimoLogo.tsx dưới dạng data URL
# Chạy 1 lần từ thư mục project: .\scripts\inject-logo.ps1

param(
  [string]$LogoFull = "public\brand\logo-full.png",
  [string]$LogoIcon = "public\brand\logo-icon.png",
  [string]$Target   = "src\components\FimoLogo.tsx"
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

function To-DataUrl($relPath) {
  $abs = Join-Path $root $relPath
  if (-not (Test-Path $abs)) { return $null }
  $bytes = [IO.File]::ReadAllBytes($abs)
  $b64   = [Convert]::ToBase64String($bytes)
  $ext   = [IO.Path]::GetExtension($abs).TrimStart('.').ToLower()
  $mime  = if ($ext -eq 'svg') { 'image/svg+xml' } else { "image/$ext" }
  return "data:$mime;base64,$b64"
}

$full = To-DataUrl $LogoFull
$icon = To-DataUrl $LogoIcon

if (-not $full -and -not $icon) {
  Write-Host "Không tìm thấy file ảnh logo. Đặt file vào public\brand\ trước." -ForegroundColor Red
  exit 1
}

$tsx = Join-Path $root $Target
$content = Get-Content $tsx -Raw

# Thay SRC_FULL / SRC_ICON bằng data URL
if ($full) {
  $content = $content -replace "const SRC_FULL = '[^']*'", "const SRC_FULL = '$full'"
  Write-Host "logo-full.png: OK ($([Math]::Round($full.Length/1024))KB data URL)" -ForegroundColor Green
}
if ($icon) {
  $content = $content -replace "const SRC_ICON = '[^']*'", "const SRC_ICON = '$icon'"
  Write-Host "logo-icon.png: OK ($([Math]::Round($icon.Length/1024))KB data URL)" -ForegroundColor Green
}

Set-Content $tsx $content -Encoding UTF8 -NoNewline
Write-Host "FimoLogo.tsx updated — chay 'bun run dev' va reload browser." -ForegroundColor Cyan
