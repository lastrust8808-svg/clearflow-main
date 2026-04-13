param(
  [ValidateSet('overview', 'bill', 'bank', 'entities', 'documents', 'investments', 'navigation', 'coa', 'paybill', 'reconcile', 'mercury', 'vendors', 'invoice', 'receipts', 'journal', 'reports', 'settings', 'authority', 'trustfunding', 'wallets', 'membership')]
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
} elseif ($Video -eq 'bank') {
  $scenes = @(
    @{ Title='Connect Accounts And Understand Rails'; Subtitle='Open Accounting, then Bank Feed, to connect accounts and review live execution readiness.'; ActiveNav='Accounting'; Tabs=@('Dashboard','Bank Feed','COA','Reconciliation'); ActiveTab='Bank Feed'; Cards=@('Connect Account|Plaid or supported provider','Manual Account|Fallback only when needed','Live Feed|Statement activity sync','COA Mapping|Account record created'); Callout='Teacher cue: connected accounts should become usable COA records.'; Script='Open Accounting, then choose Bank Feed. This is where users connect bank and financial accounts, review live feed readiness, and confirm that connected accounts become usable chart of accounts records.' },
    @{ Title='Know What Each Rail Means'; Subtitle='A connected feed is not always the same thing as payment execution.'; ActiveNav='Accounting'; Tabs=@('Bank Feed','ACH','Checks','Wire','Biller Direct'); ActiveTab='ACH'; Cards=@('Bank Feed|Read activity and match records','ACH|Bank-originated transfer path','Printable Check|Mail or positive pay workflow','Biller Direct|Provider-specific utility path'); Callout='Teacher cue: only show working choices when the provider is ready.'; Script='Next, read the rail posture. A live bank feed can sync activity, while ACH, check generation, wire, and biller direct are separate execution paths. ClearFlow should show only the options that are actually configured and ready.' },
    @{ Title='Verify Before Moving Money'; Subtitle='Use provider status, trace numbers, bank match, and reconciliation to prove the result.'; ActiveNav='Accounting'; Tabs=@('Payments','Bank Feed','Reconciliation','Documents'); ActiveTab='Reconciliation'; Cards=@('Provider Status|Submitted, processing, failed, settled','Trace Or Check ID|External reference','Bank Match|Debit or credit matched','Documents|Receipt and proof retained'); Callout='Teacher cue: execution is not complete until status and proof are visible.'; Script='Before treating any movement as complete, verify the provider status, trace number or check identifier, bank match, and supporting documents. Execution means the record is traceable, reconcilable, and visible in the ledger trail.' }
  )
} elseif ($Video -eq 'entities') {
  $scenes = @(
    @{ Title='Set Up An Entity Profile'; Subtitle='Create the trust, business, or personal profile before attaching records.'; ActiveNav='Entities'; Tabs=@('Profiles','Authority','Documents','Members'); ActiveTab='Profiles'; Cards=@('Entity Type|Trust, business, or individual','Profile Fields|Name, role, jurisdiction','Active Entity|Records save here','Next Step|Upload authority proof'); Callout='Teacher cue: choose the active entity first so every record has the right home.'; Script='Open Entities and create the profile first. Choose whether the account represents a trust, business, or individual, then confirm the active entity before adding accounting records, documents, or payment workflows.' },
    @{ Title='Upload Authority Proof'; Subtitle='Attach certificate, formation, trust, or authorized representative documents.'; ActiveNav='Entities'; Tabs=@('Profiles','Authority','Documents','Members'); ActiveTab='Authority'; Cards=@('Certificate Or Record|Upload proof document','Name Match|Compare user and signer names','Mismatch|Add authorized person','Transaction Hold|Data entry allowed, release paused'); Callout='Teacher cue: users can keep entering data while authority review protects transactions.'; Script='Next, upload authority proof. ClearFlow should compare the signer or administrator names to the signed-in user. If there is a mismatch, the user can add the authorized person, while sensitive transaction release stays paused.' },
    @{ Title='Use The Entity As The Operating Folder'; Subtitle='Bills, uploads, ledgers, investments, and reports should connect back here.'; ActiveNav='Entities'; Tabs=@('Records','Accounting','Documents','Reports'); ActiveTab='Records'; Cards=@('Bills|Saved under the entity','Documents|Proof retained','Ledger|COA and entries connect','Reports|Entity-scoped output'); Callout='Teacher cue: entity setup is the anchor for every later workflow.'; Script='Once the profile is active, use it as the operating folder. Bills, documents, ledger entries, investment plans, and reports should all connect back to the selected entity so users can find the record trail later.' }
  )
} elseif ($Video -eq 'documents') {
  $scenes = @(
    @{ Title='Use Documents And Vault'; Subtitle='Open Documents to retain uploads, packets, receipts, bills, and proof.'; ActiveNav='Documents'; Tabs=@('Inbox','Vault','Packets','Evidence'); ActiveTab='Inbox'; Cards=@('Upload|Bills, records, receipts','Extract|Read key details','Classify|Authority, financial, tax','Save|Retain in vault'); Callout='Teacher cue: uploads should become findable records, not disappear after extraction.'; Script='Open Documents and Vault when you need to retain uploads, receipts, bills, authority records, and generated packets. Uploads should become findable records after extraction, classification, and save.' },
    @{ Title='Connect Documents To Workflows'; Subtitle='A document is stronger when it links back to the entity and action it supports.'; ActiveNav='Documents'; Tabs=@('Vault','Entity Links','Accounting','Compliance'); ActiveTab='Entity Links'; Cards=@('Entity Link|Trust, business, or person','Accounting Link|Bill, invoice, payment','Compliance Link|Review and retention','Packet Link|Generated support record'); Callout='Teacher cue: proof belongs with the workflow it supports.'; Script='Next, connect the document to the workflow it supports. Link it to the active entity, a bill or payment, a compliance review, or a generated packet so the proof trail stays complete.' },
    @{ Title='Find Proof Later'; Subtitle='Use search, categories, and linked records to answer what happened and where the proof is.'; ActiveNav='Documents'; Tabs=@('Search','Categories','Linked Records','Reports'); ActiveTab='Search'; Cards=@('Search|Find by name or amount','Category|Financial, tax, authority','Linked Record|Open the related action','Report|Use retained evidence'); Callout='Teacher cue: the vault is the audit trail users come back to.'; Script='Finally, use the vault to find proof later. Search by name, category, amount, or linked record. The goal is simple: when a user asks what happened, ClearFlow should show the record and the evidence.' }
  )
} elseif ($Video -eq 'investments') {
  $scenes = @(
    @{ Title='Use Investment Planning'; Subtitle='Open Investments to model strategy before treating anything as live execution.'; ActiveNav='Investments'; Tabs=@('Plans','Real Estate','1031','Funding'); ActiveTab='Plans'; Cards=@('Plan Type|Real estate or funding','Assumptions|Costs, terms, timeline','ROI View|Estimate return posture','Save Plan|Action plan retained'); Callout='Teacher cue: planning output is saved as a plan of action.'; Script='Open Investments when you want to model a strategy before treating anything as live execution. Choose a plan type, enter assumptions, review cost and return posture, then save the plan of action.' },
    @{ Title='Build A Real Estate Scenario'; Subtitle='Estimate upfront cost, financing, monthly cost, budget, and return assumptions.'; ActiveNav='Investments'; Tabs=@('Real Estate','Budget','Loan Terms','ROI'); ActiveTab='Real Estate'; Cards=@('Purchase Price|Starting assumption','Upfront Costs|Closing and repairs','Loan Terms|Payment and rate','Return View|Rent, hold, or exit'); Callout='Teacher cue: users should see the math before they commit capital.'; Script='For a real estate scenario, enter purchase price, upfront costs, loan terms, operating budget, income assumptions, and exit strategy. The goal is to see the math before committing capital.' },
    @{ Title='Keep Education Separate From Execution'; Subtitle='1031, funding, and reinvestment tools should guide, save, and flag required review.'; ActiveNav='Investments'; Tabs=@('1031','Funding','Risk','Saved Plans'); ActiveTab='Saved Plans'; Cards=@('1031 Review|Qualification checklist','Funding Path|Source or project funding','Risk Notes|Required review flags','Saved Plans|Return to the strategy'); Callout='Teacher cue: ClearFlow stores the strategy, but qualified execution still needs review.'; Script='Finally, keep education and planning separate from execution. ClearFlow can store strategy, 1031 review notes, funding paths, and risk flags, but qualified execution still needs the right provider and professional review.' }
  )
} elseif ($Video -eq 'navigation') {
  $scenes = @(
    @{ Title='Find Your Way Around ClearFlow'; Subtitle='Use the left panel for major desks and the current desk tabs for task work.'; ActiveNav='Overview'; Tabs=@('Overview','Entities','Accounting','Documents'); ActiveTab='Overview'; Cards=@('Left Panel|Switch major desks','Desk Tabs|Work inside a section','Action Buttons|Start common tasks','Saved Records|Verify what changed'); Callout='Teacher cue: left panel changes the workspace; tabs complete the task.'; Script='This walkthrough shows the basic navigation pattern in ClearFlow. Use the left panel to switch major desks, then use the tabs and action buttons inside the selected desk to complete the task.' },
    @{ Title='Use Quick Open And Search'; Subtitle='Search across entities, documents, payments, obligations, compliance, and resources.'; ActiveNav='AI Studio'; Tabs=@('Search','Quick Open','Recent','Pinned'); ActiveTab='Search'; Cards=@('Search Box|Type a name or record','Quick Open|Jump to a section','Recent|Return to recent work','Pinned|Keep frequent paths'); Callout='Teacher cue: search is the fastest path when the app feels full.'; Script='When the app feels full, use search or Quick Open. Type a name, bill, document, payment, entity, or resource keyword, then open the matching record or desk directly.' },
    @{ Title='Verify After Every Action'; Subtitle='After saving or submitting, look for the visible record, status, or ledger update.'; ActiveNav='Accounting'; Tabs=@('Dashboard','Bills','Documents','Ledger'); ActiveTab='Dashboard'; Cards=@('Saved Bill|Appears in Bills','Uploaded File|Appears in Vault','Payment Action|Shows status trail','Ledger Entry|Shows accounting effect'); Callout='Teacher cue: the best confirmation is seeing the saved record in the right place.'; Script='After every action, verify the result. A saved bill should appear in Bills, an uploaded file should appear in Vault, a payment action should show status, and accounting movement should show in the ledger trail.' }
  )
} elseif ($Video -eq 'coa') {
  $scenes = @(
    @{ Title='Use Chart Of Accounts'; Subtitle='Open Accounting, then Chart of Accounts, to see permanent ledger accounts.'; ActiveNav='Accounting'; Tabs=@('Dashboard','Chart of Accounts','Bank Feed','Journal'); ActiveTab='Chart of Accounts'; Cards=@('Asset Accounts|Cash, banks, wallets','Liability Accounts|Cards, payables, loans','Income Accounts|Receipts and revenue','Expense Accounts|Bills and costs'); Callout='Teacher cue: the COA is where connected accounts become accounting records.'; Script='Open Accounting and choose Chart of Accounts. This is where ClearFlow organizes permanent ledger accounts for cash, connected banks, cards, wallets, receivables, payables, income, and expenses.' },
    @{ Title='Connected Accounts Map Into COA'; Subtitle='Banks, cards, processors, and wallets should create or map to accounting accounts.'; ActiveNav='Accounting'; Tabs=@('Bank Feed','Connected Accounts','COA Rules','Journal'); ActiveTab='Connected Accounts'; Cards=@('Bank Account|Operating cash account','Credit Card|Liability or card payable','Stripe Or Square|Processor clearing','Wallet|Digital asset or custody account'); Callout='Teacher cue: connection is not just a login; it creates accounting structure.'; Script='When users connect a bank, card, processor, or wallet, the connection should map into the chart of accounts. The goal is not just login access, but usable accounting structure for posting and reconciliation.' },
    @{ Title='Review Rules And Entries'; Subtitle='Users can review automated mappings and verify the journal or reconciliation effect.'; ActiveNav='Accounting'; Tabs=@('COA Rules','Journal','Reconciliation','Reports'); ActiveTab='COA Rules'; Cards=@('Auto Rules|Suggested posting logic','Edit Mapping|Change account targets','Journal View|See accounting movement','Reconcile|Match to bank activity'); Callout='Teacher cue: users should be able to see and correct where activity posts.'; Script='Finally, review COA rules and entries. Users should be able to see automated posting logic, adjust mappings when needed, open related journal entries, and reconcile activity against bank or provider data.' }
  )
} elseif ($Video -eq 'paybill') {
  $scenes = @(
    @{ Title='Pay A Saved Bill'; Subtitle='Open Accounting, then Bills, and choose the saved bill record.'; ActiveNav='Accounting'; Tabs=@('Dashboard','Bills','Pay This Bill','Payments'); ActiveTab='Bills'; Cards=@('Saved Bill|Open the record','Vendor|Confirm payee','Amount Due|Confirm amount','Due Date|Confirm timing'); Callout='Teacher cue: paying starts from the saved bill, not the upload modal.'; Script='To pay a bill, start from the saved bill record. Open Accounting, choose Bills, select the saved bill, then confirm vendor, amount due, due date, and supporting document before starting payment.' },
    @{ Title='Choose A Working Payment Method'; Subtitle='Only use payment options that are configured and ready for the account.'; ActiveNav='Accounting'; Tabs=@('Pay This Bill','ACH','Check','Provider'); ActiveTab='Pay This Bill'; Cards=@('ACH|Requires ready provider path','Printable Check|Use when check rail is chosen','Provider Pay|Provider-scoped execution','Manual Hold|Use when not ready'); Callout='Teacher cue: do not allow nonworking choices to pretend they executed.'; Script='Next, choose a working payment method. ACH requires a ready provider or bank path. Printable check uses the check workflow. Provider pay is provider scoped. If the rail is not ready, the correct result is a hold or staged workflow, not pretend execution.' },
    @{ Title='Verify Payment Status'; Subtitle='After initiating payment, confirm status, trace, documents, and ledger effect.'; ActiveNav='Accounting'; Tabs=@('Payments','Ledger','Bank Feed','Documents'); ActiveTab='Payments'; Cards=@('Payment Status|Draft, submitted, settled, failed','Trace Or Check ID|External reference','Ledger Move|Payable and cash effect','Proof|Receipt or packet retained'); Callout='Teacher cue: payment is complete only when status and proof are visible.'; Script='After initiation, verify the payment status. Look for draft, submitted, settled, or failed status, then check trace or check ID, ledger movement, bank feed match when available, and retained proof in Documents.' }
  )
} elseif ($Video -eq 'reconcile') {
  $scenes = @(
    @{ Title='Reconcile Bank Activity'; Subtitle='Open Accounting, then Reconciliation, to match ledger activity to bank or provider data.'; ActiveNav='Accounting'; Tabs=@('Bank Feed','Reconciliation','Ledger','Documents'); ActiveTab='Reconciliation'; Cards=@('Bank Feed Line|Imported or manual activity','Ledger Entry|Bill, payment, receipt','Match Status|Open, matched, exception','Proof|Document or receipt'); Callout='Teacher cue: reconciliation proves the record trail agrees with money movement.'; Script='Open Accounting and choose Reconciliation. This is where bank feed lines, payment records, receipts, and journal entries are matched so the record trail agrees with money movement.' },
    @{ Title='Match Or Flag Exceptions'; Subtitle='Use amount, date, counterparty, trace, and document proof to match activity.'; ActiveNav='Accounting'; Tabs=@('Open Items','Suggested Matches','Exceptions','Review'); ActiveTab='Suggested Matches'; Cards=@('Amount|Compare totals','Date|Compare posting timing','Counterparty|Vendor or source','Trace|Provider or check reference'); Callout='Teacher cue: if the details do not agree, flag it instead of forcing a match.'; Script='Use amount, date, counterparty, trace or check reference, and supporting documents to confirm a match. If the details do not agree, flag the item as an exception instead of forcing it closed.' },
    @{ Title='Close With Evidence'; Subtitle='Matched activity should show a clear status, linked records, and retained proof.'; ActiveNav='Accounting'; Tabs=@('Matched','Ledger','Documents','Reports'); ActiveTab='Matched'; Cards=@('Matched Status|Reconciled or reviewed','Linked Records|Payment and bill','Ledger Effect|Cash and payable movement','Evidence|Vault proof retained'); Callout='Teacher cue: the user should see what matched and where the proof lives.'; Script='After matching, confirm the item shows reconciled or reviewed status, linked records, ledger effect, and retained evidence. The user should be able to see what matched and where the proof lives.' }
  )
} elseif ($Video -eq 'mercury') {
  $scenes = @(
    @{ Title='Connect Mercury In ClearFlow'; Subtitle='Use Mercury as a business banking profile, separate from general Plaid bank connection.'; ActiveNav='Accounting'; Tabs=@('Bank Feed','Connected Accounts','COA','Mercury'); ActiveTab='Connected Accounts'; Cards=@('Existing User|Login to Mercury','New User|Open Mercury through ClearFlow','Profile Save|Save account details','COA Mapping|Map to ledger account'); Callout='Teacher cue: Mercury signup and Mercury connection are two different actions.'; Script='This walkthrough shows how Mercury fits into ClearFlow. Mercury is a business banking provider profile. Existing users can log in to Mercury, while new users can open a Mercury account through ClearFlow, then return to save and map the account.' },
    @{ Title='Choose Existing Or New Account'; Subtitle='Existing users use Mercury login; new users use the ClearFlow referral signup link.'; ActiveNav='Accounting'; Tabs=@('Mercury','Login','Referral','Profile'); ActiveTab='Mercury'; Cards=@('Login Existing|Mercury app login','Open New|ClearFlow referral link','Return To ClearFlow|Save account profile','Provider Scope|API or OAuth approval later'); Callout='Teacher cue: login opens Mercury; ClearFlow saves the accounting profile after setup.'; Script='Inside the connected account modal, choose Mercury Business Banking. Existing Mercury users can open the Mercury login. New users can open a Mercury account through the ClearFlow referral link. After Mercury setup, return to ClearFlow to save the profile.' },
    @{ Title='Map Mercury Into Accounting'; Subtitle='After setup, save the Mercury profile into COA and use reconciliation for proof.'; ActiveNav='Accounting'; Tabs=@('COA','Bank Feed','Reconciliation','Documents'); ActiveTab='COA'; Cards=@('Account Label|Mercury operating account','Ledger Account|Cash or treasury asset','Statements|Sync or import later','Reconcile|Match activity to ledger'); Callout='Teacher cue: the value is the accounting trail, not just the login button.'; Script='Finally, map the Mercury account into accounting. Give it a clear account label, connect or create the ledger account, then use bank feed, statement import, and reconciliation when the provider access is available.' }
  )
} elseif ($Video -eq 'vendors') {
  $scenes = @(
    @{ Title='Add A Vendor Or Payee'; Subtitle='Open Accounting, then Vendors, to create reusable payee records.'; ActiveNav='Accounting'; Tabs=@('Vendors','Payees','Bills','Payments'); ActiveTab='Vendors'; Cards=@('Vendor Name|Who gets paid','Payee Type|Utility, contractor, bank','Instructions|ACH, check, biller path','Documents|W9, invoice, contract'); Callout='Teacher cue: add the payee once, then reuse it for bills and payments.'; Script='Open Accounting and choose Vendors. Add the vendor or payee once so it can be reused for bills, remittances, documents, and payment workflows.' },
    @{ Title='Choose Search Or Manual Entry'; Subtitle='Use known payee presets when available, or enter a manual payee when not listed.'; ActiveNav='Accounting'; Tabs=@('Search','Manual Entry','Instructions','Review'); ActiveTab='Search'; Cards=@('Search Payees|Find common providers','Manual Payee|Use when not listed','Account Ref|Customer or account number','Verification|Review instructions'); Callout='Teacher cue: searchable payees help, but manual entry must remain available.'; Script='Search for common payees when available, or use manual entry when the payee is not listed. Confirm account reference, payment instructions, and verification status before using the vendor in a payment.' },
    @{ Title='Use Vendor Records In Workflow'; Subtitle='Vendor records connect to bills, payments, documents, and reporting.'; ActiveNav='Accounting'; Tabs=@('Bills','Payments','Documents','Reports'); ActiveTab='Bills'; Cards=@('Bill Intake|Select vendor','Payment|Use verified instructions','Vault|Attach contracts and W9s','Reports|Track vendor exposure'); Callout='Teacher cue: vendor setup makes later bill payment faster and safer.'; Script='After saving, use the vendor record during bill intake and payment. Link contracts, W9s, invoices, and proof documents so later reports can show vendor exposure and payment history.' }
  )
} elseif ($Video -eq 'invoice') {
  $scenes = @(
    @{ Title='Create An Invoice'; Subtitle='Open Accounting, then Invoices, to create receivables.'; ActiveNav='Accounting'; Tabs=@('Invoices','Customers','Receivables','Reports'); ActiveTab='Invoices'; Cards=@('Customer|Who owes you','Line Items|What was billed','Due Date|When payment is due','Invoice Total|Amount receivable'); Callout='Teacher cue: an invoice creates a receivable record.'; Script='Open Accounting and choose Invoices. Select or add the customer, enter line items, due date, and invoice total, then save the invoice as a receivable record.' },
    @{ Title='Track Invoice Status'; Subtitle='Use statuses to see draft, sent, due, paid, or overdue invoices.'; ActiveNav='Accounting'; Tabs=@('Draft','Sent','Due','Paid'); ActiveTab='Due'; Cards=@('Draft|Not sent yet','Sent|Customer-facing record','Due|Waiting for payment','Paid|Matched to receipt'); Callout='Teacher cue: invoice status tells the user what needs follow up.'; Script='Track invoice status after saving. Draft means not sent. Sent means customer-facing. Due or overdue needs follow-up. Paid should connect to a receipt or bank match.' },
    @{ Title='Match Payment To Receivable'; Subtitle='When money comes in, connect receipts and bank feed to the invoice.'; ActiveNav='Accounting'; Tabs=@('Receipts','Bank Feed','Reconciliation','Ledger'); ActiveTab='Receipts'; Cards=@('Receipt|Incoming payment','Bank Match|Deposit line','Ledger|Receivable cleared','Proof|Invoice and receipt retained'); Callout='Teacher cue: receivables close when payment is matched and recorded.'; Script='When money comes in, match the receipt or bank feed line to the invoice. The receivable should clear, the ledger should update, and invoice and receipt proof should stay linked.' }
  )
} elseif ($Video -eq 'receipts') {
  $scenes = @(
    @{ Title='Record Receipts And Income'; Subtitle='Open Accounting, then Receipts, to record incoming money.'; ActiveNav='Accounting'; Tabs=@('Receipts','Income','Bank Feed','Invoices'); ActiveTab='Receipts'; Cards=@('Source|Customer or payer','Amount|Money received','Deposit Date|When posted','Category|Income or reimbursement'); Callout='Teacher cue: receipts explain why money came in.'; Script='Open Accounting and choose Receipts. Record who paid, how much came in, when it posted, and what income or reimbursement category it belongs to.' },
    @{ Title='Connect Receipts To Documents'; Subtitle='Attach proof such as receipt files, invoices, deposit records, or processor reports.'; ActiveNav='Accounting'; Tabs=@('Receipts','Documents','Processor','Bank Feed'); ActiveTab='Documents'; Cards=@('Invoice|What was billed','Receipt File|Proof of payment','Processor Report|Stripe or Square support','Bank Line|Deposit activity'); Callout='Teacher cue: income records need proof just like bills do.'; Script='Attach proof to the receipt. This can be the invoice, receipt file, processor payout report, or bank deposit line, so income has a retained evidence trail.' },
    @{ Title='Verify Income In The Ledger'; Subtitle='Receipt records should update income, cash, and reconciliation posture.'; ActiveNav='Accounting'; Tabs=@('Ledger','Income','Reconciliation','Reports'); ActiveTab='Ledger'; Cards=@('Cash|Deposit account','Income|Revenue category','Match|Bank activity matched','Report|Totals updated'); Callout='Teacher cue: receipt entry should be visible in accounting totals.'; Script='After saving, verify the receipt in the ledger and income views. Cash and income should update, the bank match should be available when feed data exists, and reports should reflect the receipt.' }
  )
} elseif ($Video -eq 'journal') {
  $scenes = @(
    @{ Title='Use Journal Entries'; Subtitle='Open Accounting, then Journal, for manual accounting adjustments.'; ActiveNav='Accounting'; Tabs=@('Journal','COA','Documents','Review'); ActiveTab='Journal'; Cards=@('Date|Entry date','Debit|Account increased','Credit|Account offset','Memo|Reason for entry'); Callout='Teacher cue: journal entries should explain the accounting movement.'; Script='Open Accounting and choose Journal when you need a manual accounting adjustment. Enter the date, debit account, credit account, amount, and memo so the movement is explainable.' },
    @{ Title='Attach Supporting Proof'; Subtitle='Manual entries should connect to documents, bills, receipts, or notes.'; ActiveNav='Accounting'; Tabs=@('Journal','Documents','Bills','Receipts'); ActiveTab='Documents'; Cards=@('Support Doc|Upload or link proof','Bill|Payable support','Receipt|Income support','Memo|Internal explanation'); Callout='Teacher cue: do not leave manual entries unsupported.'; Script='Attach supporting proof whenever possible. Link the entry to a bill, receipt, document, or internal memo so manual accounting changes have a retained explanation.' },
    @{ Title='Review Before Posting'; Subtitle='Confirm debits and credits balance, then check ledger output.'; ActiveNav='Accounting'; Tabs=@('Review','Posted','Ledger','Reports'); ActiveTab='Review'; Cards=@('Balanced Entry|Debits equal credits','Posted Status|Finalized entry','Ledger View|Account movement','Reports|Totals affected'); Callout='Teacher cue: review the effect before treating it as final.'; Script='Before treating a journal entry as final, confirm debits and credits balance, review the memo and proof, then check the ledger and reports to see the effect.' }
  )
} elseif ($Video -eq 'reports') {
  $scenes = @(
    @{ Title='Use Reports And Compliance Review'; Subtitle='Open Compliance and Reports to generate entity-scoped review output.'; ActiveNav='Compliance'; Tabs=@('Reports','Compliance','Exceptions','Filings'); ActiveTab='Reports'; Cards=@('Entity Scope|Choose the profile','Report Window|Time period','Exceptions|Items needing review','Output|Generated packet'); Callout='Teacher cue: reports should pull from saved records, not guesses.'; Script='Open Compliance and Reports to generate review output from saved workspace data. Choose the entity, report window, and report type so the output is scoped to the right record set.' },
    @{ Title='Review Exception Signals'; Subtitle='Look for unmatched records, filing items, rail issues, and missing proof.'; ActiveNav='Compliance'; Tabs=@('Exceptions','Evidence Gaps','Rails','Tax'); ActiveTab='Exceptions'; Cards=@('Unmatched|Needs reconciliation','Evidence Gap|Missing proof','Rail Issue|Payment blocker','Filing Item|Tax or report review'); Callout='Teacher cue: exception reports tell users what needs attention.'; Script='Use exception signals to see what needs attention. ClearFlow can surface unmatched records, evidence gaps, rail issues, filing items, and compliance reviews.' },
    @{ Title='Save The Report Packet'; Subtitle='Generated reports should be retained and linked back to the entity.'; ActiveNav='Documents'; Tabs=@('Generated Reports','Vault','Entity Links','Review'); ActiveTab='Generated Reports'; Cards=@('Report Packet|Saved output','Entity Link|Correct profile','Vault|Retained evidence','Next Step|Follow-up actions'); Callout='Teacher cue: a report is useful when it is saved and findable.'; Script='After generating a report, save the packet and confirm it links back to the entity and vault. A report is useful when the user can return to it and act on the follow-up items.' }
  )
} elseif ($Video -eq 'settings') {
  $scenes = @(
    @{ Title='Use Settings And Profile'; Subtitle='Open Settings to review workspace access, profile details, and connected services.'; ActiveNav='Settings'; Tabs=@('Profile','Workspace','Connections','Billing'); ActiveTab='Profile'; Cards=@('User Profile|Name and contact','Workspace|Preferences','Connections|Google, bank, providers','Billing|Membership status'); Callout='Teacher cue: settings control identity, access, and connected services.'; Script='Open Settings to review user profile, workspace preferences, connected services, and billing or membership status. This is where users check identity and access posture.' },
    @{ Title='Review Connected Services'; Subtitle='Confirm provider access, Google Drive posture, financial connections, and account status.'; ActiveNav='Settings'; Tabs=@('Connections','Google','Financial','Providers'); ActiveTab='Connections'; Cards=@('Google|Drive or sign-in posture','Financial|Bank and provider status','Mercury|Business banking path','Stripe|Membership payments'); Callout='Teacher cue: connected services should show what is ready and what needs setup.'; Script='Review connected services to see what is ready and what needs setup. Check Google, financial providers, Mercury, Stripe, and other service connections without confusing them with completed transactions.' },
    @{ Title='Use Settings For Follow-Up'; Subtitle='Return here when sign-in, terms, billing, or provider setup needs attention.'; ActiveNav='Settings'; Tabs=@('Access','Terms','Billing','Support'); ActiveTab='Access'; Cards=@('Sign-In|Account access','Terms|Consent record','Billing|Plan and autopay','Support|Help path'); Callout='Teacher cue: settings is the support home for account setup issues.'; Script='Return to Settings when sign-in, terms, billing, autopay, provider access, or support details need attention. It is the user account setup and maintenance area.' }
  )
} elseif ($Video -eq 'authority') {
  $scenes = @(
    @{ Title='Resolve Authority Mismatches'; Subtitle='If uploaded authority names do not match the user, transaction release should pause.'; ActiveNav='Entities'; Tabs=@('Authority','Documents','Members','Holds'); ActiveTab='Authority'; Cards=@('Uploaded Proof|Trust or formation record','Name Check|Compare signer names','Mismatch|Add authorized person','Hold|Pause transaction release'); Callout='Teacher cue: data entry can continue, but sensitive release waits for proof.'; Script='When uploaded authority documents show a different signer or administrator, ClearFlow should pause sensitive transaction release while allowing normal data entry to continue.' },
    @{ Title='Add Authorized People'; Subtitle='Add the trustee, manager, signer, or representative who appears in the record.'; ActiveNav='Entities'; Tabs=@('Members','Roles','Proof','Review'); ActiveTab='Members'; Cards=@('Person|Name and contact','Role|Trustee or manager','Proof|Linked document','Review|Authority status'); Callout='Teacher cue: add the correct person instead of forcing a name match.'; Script='Add the authorized person who appears in the record, such as a trustee, manager, signer, or representative. Link that person back to the proof document and role.' },
    @{ Title='Release After Review'; Subtitle='Once authority is resolved, the entity can proceed with transaction workflows.'; ActiveNav='Entities'; Tabs=@('Review','Status','Accounting','Payments'); ActiveTab='Status'; Cards=@('Authority Status|Resolved or review','Transaction Hold|Removed when ready','Records|Still retained','Payments|Can proceed when allowed'); Callout='Teacher cue: authority review protects the user and the entity.'; Script='After authority is resolved, the entity can proceed with transaction workflows when allowed. The review protects the user, the entity, and the record trail.' }
  )
} elseif ($Video -eq 'trustfunding') {
  $scenes = @(
    @{ Title='Use Trust Funding'; Subtitle='Open Assets and Reserve or Entities to record how a trust is funded.'; ActiveNav='Assets & Reserve'; Tabs=@('Trust Funding','Reserve','Collateral','Documents'); ActiveTab='Trust Funding'; Cards=@('Initial Funding|Cash or assets','Reserve Holdings|Accounts and custody','Collateral|Gold, silver, property','Documents|Governing terms'); Callout='Teacher cue: a trust needs funding records before operating assumptions matter.'; Script='Use Trust Funding to record how a trust is funded. Add cash, reserve holdings, collateral, and documents that support the trust operation.' },
    @{ Title='Record Assets And Collateral'; Subtitle='Enter gold, silver, property, securities, accounts, and identifiers as applicable.'; ActiveNav='Assets & Reserve'; Tabs=@('Assets','Collateral','Identifiers','Valuation'); ActiveTab='Collateral'; Cards=@('Item|Gold, silver, property','Quantity|Units or pieces','Identifier|Serial, title, account','Value|Estimated amount'); Callout='Teacher cue: collateral records should include identifiers and proof.'; Script='Record assets and collateral with clear details. Include item type, quantity, identifiers, estimated value, and supporting proof so the reserve record is traceable.' },
    @{ Title='Link Funding To Accounting'; Subtitle='Funding should connect to entity records, reserve posture, and ledger review.'; ActiveNav='Accounting'; Tabs=@('Ledger','Reserve','Documents','Reports'); ActiveTab='Reserve'; Cards=@('Entity Link|Trust profile','Ledger View|Funding posture','Reserve|Held value','Reports|Review output'); Callout='Teacher cue: funding records should appear in the entity and accounting trail.'; Script='Link funding records back to the entity, reserve posture, documents, and accounting review so the user can see how trust funding supports operations.' }
  )
} elseif ($Video -eq 'wallets') {
  $scenes = @(
    @{ Title='Use Wallets And Digital Assets'; Subtitle='Open Assets and Reserve to track wallets, custody, tokens, and digital asset records.'; ActiveNav='Assets & Reserve'; Tabs=@('Wallets','Digital Assets','Custody','COA'); ActiveTab='Wallets'; Cards=@('Wallet|Address or account','Provider|Custody or wallet app','Asset|Token or coin','COA|Accounting account'); Callout='Teacher cue: connected wallets should map into accounting when used operationally.'; Script='Open Assets and Reserve to track wallets, custody accounts, tokens, and digital asset records. Wallets used operationally should map into accounting records.' },
    @{ Title='Record The Wallet Profile'; Subtitle='Save provider, address, ownership posture, and linked entity.'; ActiveNav='Assets & Reserve'; Tabs=@('Wallet Profile','Ownership','Authority','Documents'); ActiveTab='Wallet Profile'; Cards=@('Wallet Label|Clear account name','Address|Public identifier','Entity|Owner or controller','Proof|Screenshots or documents'); Callout='Teacher cue: wallet records need ownership and proof context.'; Script='Record the wallet profile with a clear label, public address or account identifier, provider, ownership posture, linked entity, and proof documents.' },
    @{ Title='Use Wallet Records Carefully'; Subtitle='Digital movement should show status, proof, and accounting effect.'; ActiveNav='Transactions'; Tabs=@('Transfers','Proof','Ledger','Review'); ActiveTab='Proof'; Cards=@('Transfer|Movement record','Tx Hash|External reference','Ledger|Accounting effect','Review|Risk and custody notes'); Callout='Teacher cue: wallet movement is not complete without proof and ledger review.'; Script='When digital movement occurs, track transfer status, transaction hash or external reference, ledger effect, and review notes. The proof trail matters as much as the wallet record.' }
  )
} elseif ($Video -eq 'membership') {
  $scenes = @(
    @{ Title='Use Membership And Referrals'; Subtitle='Open Settings or Rewards to review plan, trial, autopay, and referral posture.'; ActiveNav='Settings'; Tabs=@('Membership','Billing','Rewards','Referrals'); ActiveTab='Membership'; Cards=@('Plan|Membership tier','Trial|Free period status','Autopay|Payment setup','Rewards|Credits or coins'); Callout='Teacher cue: membership controls access and billing posture.'; Script='Use Membership and Referrals to review plan tier, free trial status, autopay setup, rewards, and referral posture.' },
    @{ Title='Share Referral Links'; Subtitle='Users can share their referral link and track qualified referral status.'; ActiveNav='Settings'; Tabs=@('Referrals','Rewards','Status','Ledger'); ActiveTab='Referrals'; Cards=@('Referral Link|Share with invitee','Qualified Signup|New user joins','Payment Rule|Credit after required payment','Rewards|Pending or earned'); Callout='Teacher cue: referral rewards should show pending versus earned clearly.'; Script='Users can share referral links and track status. Referral rewards should show pending versus earned clearly, especially when credits depend on the referred user completing a required paid month.' },
    @{ Title='Connect Billing To Records'; Subtitle='Membership payments, discounts, and rewards should be visible in the user account trail.'; ActiveNav='Settings'; Tabs=@('Billing','Autopay','Receipts','Rewards'); ActiveTab='Billing'; Cards=@('Autopay|Connected payment method','Receipt|Payment proof','Discount|Applied plan credit','Reward|Coin or credit record'); Callout='Teacher cue: billing and rewards need their own visible trail.'; Script='Membership payments, autopay, discounts, receipts, and rewards should be visible in the user account trail so users can understand what was billed, credited, or earned.' }
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
