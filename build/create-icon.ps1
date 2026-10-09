Add-Type -AssemblyName System.Drawing

$bitmap = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddArc(16, 16, 52, 52, 180, 90)
$path.AddArc(188, 16, 52, 52, 270, 90)
$path.AddArc(188, 188, 52, 52, 0, 90)
$path.AddArc(16, 188, 52, 52, 90, 90)
$path.CloseFigure()

$background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(17, 21, 18))
$border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(194, 243, 107), 8)
$graphics.FillPath($background, $path)
$graphics.DrawPath($border, $path)

$font = [System.Drawing.Font]::new('Segoe UI', 156, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$letter = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(194, 243, 107))
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('S', $font, $letter, [System.Drawing.RectangleF]::new(24, 4, 208, 236), $format)

$bitmap.Save((Join-Path $PSScriptRoot 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$format.Dispose()
$letter.Dispose()
$font.Dispose()
$border.Dispose()
$background.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()