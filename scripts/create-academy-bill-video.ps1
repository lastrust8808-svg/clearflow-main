$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repo 'academy\generated'
$slidesDir = Join-Path $outDir 'bill-slides'
$ffmpeg = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe'
$videoOut = Join-Path $outDir 'clearflow-bill-payment-video-02.mp4'
$concatFile = Join-Path $outDir 'bill-slides.txt'

New-Item -ItemType Directory -Force -Path $slidesDir | Out-Null
Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param([System.Drawing.Rectangle] $Rect, [int] $Radius)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Slide {
  param([string] $Path, [string] $Eyebrow, [string] $Title, [string] $Body, [string] $Footer)
  $width = 1920
  $height = 1080
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $bgRect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, ([System.Drawing.ColorTranslator]::FromHtml('#06111f')), ([System.Drawing.ColorTranslator]::FromHtml('#16324a')), 35
  $g.FillRectangle($bgBrush, $bgRect)
  $orbBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(44, 76, 175, 80))
  $g.FillEllipse($orbBrush, 1280, -120, 760, 760)
  $g.FillEllipse($orbBrush, -290, 760, 620, 620)
  $panelRect = New-Object System.Drawing.Rectangle 90, 90, 1740, 900
  $panelPath = New-RoundedRectPath -Rect $panelRect -Radius 58
  $panelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(184, 2, 6, 23))
  $g.FillPath($panelBrush, $panelPath)
  $panelPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 126, 242, 255)), 4
  $g.DrawPath($panelPen, $panelPath)

  $logoRect = New-Object System.Drawing.Rectangle 138, 136, 150, 150
  $logoBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $logoRect, ([System.Drawing.ColorTranslator]::FromHtml('#005A9E')), ([System.Drawing.ColorTranslator]::FromHtml('#4CAF50')), 45
  $g.FillEllipse($logoBrush, $logoRect)
  $whitePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 15
  $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $path1 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path1.AddBezier(162, 193, 198, 158, 248, 244, 286, 198)
  $g.DrawPath($whitePen, $path1)
  $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path2.AddBezier(162, 232, 200, 270, 246, 174, 286, 228)
  $g.DrawPath($whitePen, $path2)

  $eyebrowFont = New-Object System.Drawing.Font('Segoe UI', 34, [System.Drawing.FontStyle]::Bold)
  $titleFont = New-Object System.Drawing.Font('Segoe UI', 76, [System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font('Segoe UI', 42, [System.Drawing.FontStyle]::Regular)
  $footerFont = New-Object System.Drawing.Font('Segoe UI', 28, [System.Drawing.FontStyle]::Bold)
  $cyan = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#7ef2ff'))
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#ffffff'))
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#d9e7ef'))
  $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f7d37b'))
  $format = New-Object System.Drawing.StringFormat
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near

  $g.DrawString($Eyebrow.ToUpperInvariant(), $eyebrowFont, $cyan, 330, 145)
  $g.DrawString($Title, $titleFont, $white, (New-Object System.Drawing.RectangleF 330, 220, 1410, 210), $format)
  $g.DrawString($Body, $bodyFont, $muted, (New-Object System.Drawing.RectangleF 150, 465, 1620, 310), $format)
  $g.DrawString($Footer, $footerFont, $gold, 150, 890)
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

$slides = @(
  @{ Eye='ClearFlow Academy'; Title='How To Add And Save A Bill'; Body='Enter a bill, save it to the active entity, find it again, and start the payment workflow when ready.'; Footer='@ClearFlowAcademy' },
  @{ Eye='Step 1'; Title='Open Accounting'; Body='Use the left panel to open Accounting. This is where bills, payments, remittances, journals, bank feed, and reconciliation live.'; Footer='Left panel chooses the desk. Accounting handles the ERP workflow.' },
  @{ Eye='Step 2'; Title='Use Add Bill'; Body='Upload a bill image or PDF, or use manual entry when there is no file. Review vendor, amount, due date, account reference, and bill number.'; Footer='Extraction helps, but the user confirms the final values.' },
  @{ Eye='Step 3'; Title='Save To The Active Entity'; Body='When you press Save Bill, ClearFlow retains the record under the active entity so it can connect to accounting, documents, and payment status.'; Footer='Save should create a visible bill record, not just close the modal.' },
  @{ Eye='Step 4'; Title='Find The Bill Again'; Body='Return to the Bills section and verify the bill appears with vendor, due date, amount, documents, and payment state.'; Footer='The validation is seeing the saved bill in the list.' },
  @{ Eye='Step 5'; Title='Use Pay This Bill'; Body='When ready, open the saved bill and use Pay This Bill to start the payment workflow. Saving the bill and releasing payment are separate controls.'; Footer='Payment execution depends on provider, bank rail, and approval status.' },
  @{ Eye='Step 6'; Title='Verify The Payment Trail'; Body='After payment action, review payment status, settlement or provider confirmation, bank match, and supporting documents.'; Footer='ClearFlow habit: save, find, pay, verify.' }
)

$concatLines = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $slides.Count; $i++) {
  $slidePath = Join-Path $slidesDir ('slide-{0:D2}.png' -f ($i + 1))
  New-Slide -Path $slidePath -Eyebrow $slides[$i].Eye -Title $slides[$i].Title -Body $slides[$i].Body -Footer $slides[$i].Footer
  $safePath = $slidePath.Replace('\', '/').Replace("'", "'\''")
  $concatLines.Add("file '$safePath'")
  $concatLines.Add('duration 7')
}
$lastPath = (Join-Path $slidesDir ('slide-{0:D2}.png' -f $slides.Count)).Replace('\', '/').Replace("'", "'\''")
$concatLines.Add("file '$lastPath'")
Set-Content -Path $concatFile -Value $concatLines -Encoding ASCII

if (!(Test-Path $ffmpeg)) { throw "FFmpeg not found at $ffmpeg" }
& $ffmpeg -y -f concat -safe 0 -i $concatFile -vf "scale=1920:1080,format=yuv420p" -r 30 -movflags +faststart $videoOut
if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed with exit code $LASTEXITCODE" }

Copy-Item -LiteralPath $videoOut -Destination (Join-Path $env:USERPROFILE 'Downloads\clearflow-bill-payment-video-02.mp4') -Force
Write-Output $videoOut
