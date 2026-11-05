# Deterministic local asset preparation; the supplied logo is never overwritten.
# Run on Windows: powershell -NoProfile -File scripts/generate-brand-icons.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePath = Join-Path $projectDirectory 'assets\logo3.png'
$iconsDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectDirectory 'assets\icons'))
if (-not $iconsDirectory.StartsWith($projectDirectory + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Icon destination must be inside this project.'
}
[System.IO.Directory]::CreateDirectory($iconsDirectory) | Out-Null
$sourceBitmap = [System.Drawing.Bitmap]::new($sourcePath)
try {
    $left = $sourceBitmap.Width
    $top = $sourceBitmap.Height
    $right = -1
    $bottom = -1
    for ($pixelY = 0; $pixelY -lt $sourceBitmap.Height; $pixelY++) {
        for ($pixelX = 0; $pixelX -lt $sourceBitmap.Width; $pixelX++) {
            if ($sourceBitmap.GetPixel($pixelX, $pixelY).A -eq 0) { continue }
            $left = [Math]::Min($left, $pixelX)
            $right = [Math]::Max($right, $pixelX)
            $top = [Math]::Min($top, $pixelY)
            $bottom = [Math]::Max($bottom, $pixelY)
        }
    }
    if ($right -lt $left -or $bottom -lt $top) { throw 'Logo is fully transparent.' }
    $artWidth = $right - $left + 1
    $artHeight = $bottom - $top + 1
    foreach ($iconSize in @(32, 180, 192, 512)) {
        $targetPath = Join-Path $iconsDirectory ('logo-' + $iconSize + '.png')
        $iconBitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::White)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            # The entire bounding rectangle fits inside Android's central safe circle.
            # Small favicons need a larger mark; they are not declared maskable.
            $artRatio = if ($iconSize -eq 32) { 0.88 } else { 0.66 }
            $scale = ($iconSize * $artRatio) / [Math]::Max($artWidth, $artHeight)
            $drawWidth = [single]($artWidth * $scale)
            $drawHeight = [single]($artHeight * $scale)
            $destination = [System.Drawing.RectangleF]::new(
                [single](($iconSize - $drawWidth) / 2),
                [single](($iconSize - $drawHeight) / 2),
                $drawWidth, $drawHeight
            )
            $sourceRectangle = [System.Drawing.RectangleF]::new($left, $top, $artWidth, $artHeight)
            $graphics.DrawImage($sourceBitmap, $destination, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
            $iconBitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $iconBitmap.Dispose()
        }
        Write-Output ('Generated assets/icons/logo-' + $iconSize + '.png')
    }
} finally {
    $sourceBitmap.Dispose()
}
