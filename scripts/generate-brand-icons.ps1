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
    # URLs are versioned: Chrome treats unchanged manifest icon URLs as immutable.
    # Any-purpose desktop icons use a larger mark; Android's maskable icons
    # separately keep the entire mark inside the central safe circle.
    $iconSpecifications = @(
        @{ Size = 32; Suffix = '32'; ArtRatio = 0.88 },
        @{ Size = 180; Suffix = '180'; ArtRatio = 0.80 },
        @{ Size = 192; Suffix = '192'; ArtRatio = 0.80 },
        @{ Size = 512; Suffix = '512'; ArtRatio = 0.80 },
        @{ Size = 192; Suffix = 'maskable-192'; ArtRatio = 0.66 },
        @{ Size = 512; Suffix = 'maskable-512'; ArtRatio = 0.66 }
    )
    foreach ($iconSpecification in $iconSpecifications) {
        $iconSize = $iconSpecification.Size
        $iconFileName = 'app-cream-v2-' + $iconSpecification.Suffix + '.png'
        $targetPath = Join-Path $iconsDirectory $iconFileName
        $iconBitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
        try {
            $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#FFFAED'))
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $artRatio = $iconSpecification.ArtRatio
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
        Write-Output ('Generated assets/icons/' + $iconFileName)
    }
} finally {
    $sourceBitmap.Dispose()
}
