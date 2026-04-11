$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repo 'academy\generated'
$slidesDir = Join-Path $outDir 'slides'
$ffmpeg = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe'
$videoOut = Join-Path $outDir 'clearflow-overview-video-01.mp4'
$concatFile = Join-Path $outDir 'slides.txt'

New-Item -ItemType Directory -Force -Path $slidesDir | Out-Null

Add-Type -AssemblyName System.Drawing

function New-Slide {
  param(
    [string] $Path,
    [string] $Eyebrow,
    [string] $Title,
    [string] $Body,
    [string] $Footer
  )

  $width = 1920
  $height = 1080
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#07111f'))

  $bgRect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, ([System.Drawing.ColorTranslator]::FromHtml('#07111f')), ([System.Drawing.ColorTranslator]::FromHtml('#1d3b2e')), 35
  $g.FillRectangle($bgBrush, $bgRect)

  $orbBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(42, 33, 194, 198))
  $g.FillEllipse($orbBrush, 1350, -160, 620, 620)
  $g.FillEllipse($orbBrush, -260, 760, 620, 620)

  $panelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(178, 2, 6, 23))
  $panelRect = New-Object System.Drawing.Rectangle 90, 90, 1740, 900
  $panelPath = New-RoundedRectPath -Rect $panelRect -Radius 58
  $g.FillPath($panelBrush, $panelPath)
  $panelPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(72, 126, 242, 255)), 4
  $g.DrawPath($panelPen, $panelPath)

  $logoRect = New-Object System.Drawing.Rectangle 135, 135, 168, 168
  $logoBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $logoRect, ([System.Drawing.ColorTranslator]::FromHtml('#005A9E')), ([System.Drawing.ColorTranslator]::FromHtml('#4CAF50')), 45
  $g.FillEllipse($logoBrush, $logoRect)
  $whitePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 16
  $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $path1 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path1.AddBezier(160, 200, 196, 160, 250, 254, 286, 204)
  $g.DrawPath($whitePen, $path1)
  $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path2.AddBezier(160, 240, 200, 280, 248, 170, 286, 236)
  $g.DrawPath($whitePen, $path2)

  $eyebrowFont = New-Object System.Drawing.Font('Segoe UI', 34, [System.Drawing.FontStyle]::Bold)
  $titleFont = New-Object System.Drawing.Font('Segoe UI', 72, [System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font('Segoe UI', 40, [System.Drawing.FontStyle]::Regular)
  $footerFont = New-Object System.Drawing.Font('Segoe UI', 28, [System.Drawing.FontStyle]::Bold)
  $cyan = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#7ef2ff'))
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#ffffff'))
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#d9e7ef'))
  $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f7d37b'))

  $g.DrawString($Eyebrow.ToUpperInvariant(), $eyebrowFont, $cyan, 340, 145)
  $titleRect = New-Object System.Drawing.RectangleF 340, 215, 1370, 210
  $bodyRect = New-Object System.Drawing.RectangleF 150, 465, 1620, 300
  $format = New-Object System.Drawing.StringFormat
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $g.DrawString($Title, $titleFont, $white, $titleRect, $format)
  $g.DrawString($Body, $bodyFont, $muted, $bodyRect, $format)
  $g.DrawString($Footer, $footerFont, $gold, 150, 890)

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

function New-RoundedRectPath {
  param(
    [System.Drawing.Rectangle] $Rect,
    [int] $Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$slides = @(
  @{ Eye='ClearFlow Academy'; Title='ClearFlow Overview'; Body='Navigate the workspace, save actions, and verify records across entities, accounting, documents, payments, and investments.'; Footer='@ClearFlowAcademy' },
  @{ Eye='Step 1'; Title='Use The Left Panel'; Body='Choose the major desk from the left panel. Stay inside the selected desk to complete its work and avoid jumping between unrelated workflows.'; Footer='Overview | Entities | Accounting | Documents | Investments' },
  @{ Eye='Step 2'; Title='Start With Entity Boards'; Body='Create the trust, business, or individual profile first so records, accounting, uploads, and authority proof have the right home.'; Footer='Authority proof controls sensitive transaction release.' },
  @{ Eye='Step 3'; Title='Accounting Holds The ERP Flow'; Body='Use Accounting for bills, invoices, remittances, journals, chart of accounts, bank feed, reconciliation, and payment status.'; Footer='Save the bill, reopen it, then use Pay This Bill when ready.' },
  @{ Eye='Step 4'; Title='Documents Keep The Proof'; Body='The Documents Vault retains uploads, generated packets, receipts, bills, and evidence linked back to operating records.'; Footer='Every important action should have a record trail.' },
  @{ Eye='Step 5'; Title='Payments Need Readiness'; Body='Bank feeds, ACH, checks, positive pay, biller-direct, and provider rails should only show as ready when the configured provider supports them.'; Footer='Nacha supports rules and education, not origination authority by itself.' },
  @{ Eye='Step 6'; Title='Investments Save Plans'; Body='Model real estate deals, 1031 exchange steps, funding paths, and strategy lab assumptions, then save them as plans of action.'; Footer='Education and planning first; live execution requires qualified providers.' },
  @{ Eye='Final Habit'; Title='Save, Then Verify'; Body='After every action, confirm the new record appears in the right desk: Bills, Payments, COA, Documents, Bank Feed, or Saved Investment Plans.'; Footer='Next video: How To Add And Save A Bill In ClearFlow' }
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

if (!(Test-Path $ffmpeg)) {
  throw "FFmpeg not found at $ffmpeg"
}

& $ffmpeg -y -f concat -safe 0 -i $concatFile -vf "scale=1920:1080,format=yuv420p" -r 30 -movflags +faststart $videoOut
if ($LASTEXITCODE -ne 0) {
  throw "FFmpeg failed with exit code $LASTEXITCODE"
}

Write-Output $videoOut
