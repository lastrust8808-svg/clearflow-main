param(
  [ValidateSet('overview', 'bill')]
  [string]$Video = 'overview',
  [string]$VoiceName = 'Microsoft David Desktop'
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repo 'academy\generated'
$slidesDir = Join-Path $outDir ("guided-$Video-slides")
$ffmpeg = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe'
$videoOut = Join-Path $outDir ("clearflow-$Video-guided-video.mp4")
$audioOut = Join-Path $outDir ("clearflow-$Video-guided-narration.wav")
$concatFile = Join-Path $outDir ("guided-$Video-slides.txt")

New-Item -ItemType Directory -Force -Path $slidesDir | Out-Null
Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param([System.Drawing.Rectangle] $Rect, [int] $Radius)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  [void] $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
  [void] $path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
  [void] $path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  [void] $path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  [void] $path.CloseFigure()
  Write-Output -NoEnumerate $path
}

function Draw-Pill {
  param($Graphics, [int] $X, [int] $Y, [int] $W, [string] $Text, [string] $Fill, [string] $Stroke, [bool] $Active = $false)
  $rect = New-Object System.Drawing.Rectangle $X, $Y, $W, 56
  $path = New-RoundedRectPath -Rect $rect -Radius 18
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($Fill))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($Stroke)), $(if ($Active) { 4 } else { 2 })
  $Graphics.FillPath($brush, $path)
  $Graphics.DrawPath($pen, $path)
  $font = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)
  $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($(if ($Active) { '#ffffff' } else { '#cbd5e1' })))
  $Graphics.DrawString($Text, $font, $textBrush, $X + 20, $Y + 13)
}

function New-GuidedSlide {
  param(
    [string] $Path,
    [string] $Title,
    [string] $Subtitle,
    [string[]] $LeftNav,
    [string] $ActiveNav,
    [string[]] $Tabs,
    [string] $ActiveTab,
    [string[]] $Cards,
    [string] $Callout
  )

  $width = 1920
  $height = 1080
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $bgRect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, ([System.Drawing.ColorTranslator]::FromHtml('#07111f')), ([System.Drawing.ColorTranslator]::FromHtml('#153c36')), 28
  $g.FillRectangle($bg, $bgRect)

  $shellRect = New-Object System.Drawing.Rectangle 70, 70, 1780, 940
  $shell = New-RoundedRectPath -Rect $shellRect -Radius 42
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f8fafc'))), $shell)
  $g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#b6d7d8')), 3), $shell)

  $navRect = New-Object System.Drawing.Rectangle 95, 95, 360, 890
  $navPath = New-RoundedRectPath -Rect $navRect -Radius 34
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#0f172a'))), $navPath)

  $logoFont = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Bold)
  $g.DrawString('ClearFlow', $logoFont, (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#ffffff'))), 130, 128)
  $g.DrawString('Academy guided view', (New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Regular)), (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#9ca3af'))), 132, 170)

  $y = 235
  foreach ($nav in $LeftNav) {
    $isActive = $nav -eq $ActiveNav
    Draw-Pill -Graphics $g -X 125 -Y $y -W 300 -Text $nav -Fill $(if ($isActive) { '#1f766c' } else { '#111827' }) -Stroke $(if ($isActive) { '#7ef2ff' } else { '#334155' }) -Active $isActive
    $y += 76
  }

  $titleFont = New-Object System.Drawing.Font('Segoe UI', 46, [System.Drawing.FontStyle]::Bold)
  $subtitleFont = New-Object System.Drawing.Font('Segoe UI', 25, [System.Drawing.FontStyle]::Regular)
  $g.DrawString($Title, $titleFont, (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#0f172a'))), 505, 125)
  $g.DrawString($Subtitle, $subtitleFont, (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#475569'))), (New-Object System.Drawing.RectangleF 508, 190, 1260, 80))

  $x = 505
  foreach ($tab in $Tabs) {
    $tabW = [Math]::Min(250, [Math]::Max(138, 42 + ($tab.Length * 14)))
    Draw-Pill -Graphics $g -X $x -Y 285 -W $tabW -Text $tab -Fill $(if ($tab -eq $ActiveTab) { '#005a9e' } else { '#e2e8f0' }) -Stroke $(if ($tab -eq $ActiveTab) { '#005a9e' } else { '#cbd5e1' }) -Active ($tab -eq $ActiveTab)
    $x += $tabW + 16
  }

  $cardFont = New-Object System.Drawing.Font('Segoe UI', 26, [System.Drawing.FontStyle]::Bold)
  $smallFont = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Regular)
  $cardX = 505
  $cardY = 385
  for ($i = 0; $i -lt $Cards.Count; $i++) {
    $rect = New-Object System.Drawing.Rectangle ($cardX + (($i % 2) * 600)), ($cardY + ([Math]::Floor($i / 2) * 180)), 560, 140
    $cardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#ffffff'))
    $cardPen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#cbd5e1')), 2
    $g.FillRectangle($cardBrush, $rect)
    $g.DrawRectangle($cardPen, $rect)
    $parts = $Cards[$i].Split('|')
    $g.DrawString($parts[0], $cardFont, (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#0f172a'))), $rect.X + 28, $rect.Y + 24)
    if ($parts.Count -gt 1) {
      $g.DrawString($parts[1], $smallFont, (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#64748b'))), $rect.X + 30, $rect.Y + 76)
    }
  }

  $callRect = New-Object System.Drawing.Rectangle 505, 780, 1220, 150
  $callBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#0f2f35'))
  $callPen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#7ef2ff')), 3
  $g.FillRectangle($callBrush, $callRect)
  $g.DrawRectangle($callPen, $callRect)
  $g.DrawString($Callout, (New-Object System.Drawing.Font('Segoe UI', 28, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#ffffff'))), (New-Object System.Drawing.RectangleF 535, 815, 1160, 90))

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

function New-Narration {
  param([string] $Path, [string] $Text, [string] $VoiceName)
  $voice = New-Object -ComObject SAPI.SpVoice
  foreach ($candidate in $voice.GetVoices()) {
    if ($candidate.GetDescription() -like "$VoiceName*") {
      $voice.Voice = $candidate
      break
    }
  }
  $voice.Rate = -1
  $voice.Volume = 100
  $format = New-Object -ComObject SAPI.SpAudioFormat
  $format.Type = 22
  $stream = New-Object -ComObject SAPI.SpFileStream
  $stream.Format = $format
  $stream.Open($Path, 3, $false)
  $voice.AudioOutputStream = $stream
  [void] $voice.Speak($Text)
  $stream.Close()
}

$baseNav = @('Overview', 'Entities', 'Accounting', 'Documents', 'Investments', 'AI Studio')
if ($Video -eq 'bill') {
  $scenes = @(
    @{ Title='Add A Bill In ClearFlow'; Subtitle='Start in Accounting so the bill lands in the ERP record trail.'; ActiveNav='Accounting'; Tabs=@('Dashboard','Bills','Pay This Bill','Bank Feed'); ActiveTab='Bills'; Cards=@('Add Bill|Upload or enter details','Active Entity|Trust or business profile','Extracted Fields|Vendor, due date, amount','Saved Bill|Visible after save'); Callout='Teacher cue: Save the bill first, then reopen it to start payment.'; Script='Open Accounting and choose Bills. This keeps the work inside the ERP lane, where the bill can connect to entity records, documents, the ledger, and payment status.' },
    @{ Title='Confirm The Bill Data'; Subtitle='Review extracted fields before saving, especially vendor, amount, date, and account reference.'; ActiveNav='Accounting'; Tabs=@('Bills','Review','Save Bill','Documents'); ActiveTab='Review'; Cards=@('Vendor|DTE or selected payee','Amount Due|Confirm before save','Due Date|Used for workflow timing','Account Ref|Needed for application'); Callout='Teacher cue: extraction helps, but the user confirms the final data.'; Script='Now confirm the bill data. Extraction is helpful, but the user owns the final review. Check vendor, amount due, due date, account reference, and any document attachment before saving.' },
    @{ Title='Find And Pay From The Saved Bill'; Subtitle='A saved bill should stay visible, then Pay This Bill starts the controlled payment workflow.'; ActiveNav='Accounting'; Tabs=@('Bills','Saved Bills','Pay This Bill','Payments'); ActiveTab='Pay This Bill'; Cards=@('Saved Record|Bill stays listed','Payment Draft|Not sent until initiated','Rail Readiness|Only working choices show','Proof Trail|Status and documents'); Callout='Teacher cue: Save, find, initiate payment, then verify provider and bank status.'; Script='After saving, return to the Bills list and find the record. Open it, choose Pay This Bill, and verify the payment trail. ClearFlow should show only available payment choices, then track provider status and bank matching.' }
  )
} else {
  $scenes = @(
    @{ Title='ClearFlow Navigation Map'; Subtitle='Use the left panel for major desks, then stay inside the selected desk for the work.'; ActiveNav='Overview'; Tabs=@('Command Center','Tasks','Records','Readiness'); ActiveTab='Command Center'; Cards=@('Overview|Health and next actions','Entities|Profiles and authority','Accounting|Bills, ledger, payments','Documents|Evidence and packets'); Callout='Teacher cue: the left panel changes desks; tabs inside the desk complete the workflow.'; Script='Welcome to ClearFlow Academy. The left panel is your desk switcher. Choose Overview, Entities, Accounting, Documents, or Investments, then stay inside that desk to complete the workflow without losing context.' },
    @{ Title='Entities First'; Subtitle='Create the trust, business, or individual profile before attaching records.'; ActiveNav='Entities'; Tabs=@('Profiles','Authority','Documents','Members'); ActiveTab='Profiles'; Cards=@('Entity Profile|Trust, business, or person','Authority Proof|Upload certificate or record','Authorized People|Add matching names','Transaction Hold|Paused until proof clears'); Callout='Teacher cue: entity setup gives bills, documents, and payments the right home.'; Script='Start with the entity profile. Add the trust, business, or individual record, then attach authority proof and authorized people when needed. That gives uploads, bills, and payment actions the correct home.' },
    @{ Title='Accounting Runs The ERP Trail'; Subtitle='Bills, invoices, COA, remittances, bank feed, journals, and reconciliation live here.'; ActiveNav='Accounting'; Tabs=@('Dashboard','Bills','COA','Bank Feed','Journal'); ActiveTab='Dashboard'; Cards=@('Receivables|Invoices and income','Payables|Bills and expenses','COA|Connected accounts','Reconciliation|Bank and proof match'); Callout='Teacher cue: after an action, confirm it appears in the dashboard or ledger.'; Script='Accounting is the ERP trail. Bills, invoices, chart of accounts, remittances, bank feed, journals, and reconciliation live here. After an action, confirm the saved record appears in the dashboard or ledger.' }
  )
}

$concatLines = New-Object System.Collections.Generic.List[string]
$narrationParts = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $scenes.Count; $i++) {
  $slidePath = Join-Path $slidesDir ('slide-{0:D2}.png' -f ($i + 1))
  New-GuidedSlide -Path $slidePath -Title $scenes[$i].Title -Subtitle $scenes[$i].Subtitle -LeftNav $baseNav -ActiveNav $scenes[$i].ActiveNav -Tabs $scenes[$i].Tabs -ActiveTab $scenes[$i].ActiveTab -Cards $scenes[$i].Cards -Callout $scenes[$i].Callout
  $safePath = $slidePath.Replace('\', '/').Replace("'", "'\''")
  $concatLines.Add("file '$safePath'")
  $concatLines.Add('duration 16')
  $narrationParts.Add($scenes[$i].Script)
}
$lastPath = (Join-Path $slidesDir ('slide-{0:D2}.png' -f $scenes.Count)).Replace('\', '/').Replace("'", "'\''")
$concatLines.Add("file '$lastPath'")
Set-Content -Path $concatFile -Value $concatLines -Encoding ASCII
New-Narration -Path $audioOut -Text ($narrationParts -join ' ') -VoiceName $VoiceName

if (!(Test-Path $ffmpeg)) {
  throw "FFmpeg not found at $ffmpeg"
}

& $ffmpeg -y -f concat -safe 0 -i $concatFile -i $audioOut -vf "scale=1920:1080,format=yuv420p" -r 30 -c:v libx264 -c:a aac -b:a 160k -shortest -movflags +faststart $videoOut
if ($LASTEXITCODE -ne 0) {
  throw "FFmpeg failed with exit code $LASTEXITCODE"
}

Copy-Item -LiteralPath $videoOut -Destination (Join-Path $env:USERPROFILE "Downloads\$(Split-Path -Leaf $videoOut)") -Force
Write-Output $videoOut
