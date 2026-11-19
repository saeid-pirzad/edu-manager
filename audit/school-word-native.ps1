$ErrorActionPreference = 'Stop'
$wordAuditRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.cache\school-word-native'))
$wordDocumentPath = [IO.Path]::GetFullPath((Get-Content -Raw -LiteralPath (Join-Path $wordAuditRoot 'latest.txt')).Trim())
if (-not $wordDocumentPath.StartsWith($wordAuditRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($wordDocumentPath) -ne 'mixed.docx') { throw 'Native Word audit target is outside its synthetic fixture directory.' }
if (-not (Test-Path -LiteralPath $wordDocumentPath)) { throw 'Generate the synthetic DOCX first.' }
$existingWordProcesses = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object Id)
$wordAuditApplication = $null
$wordAuditDocument = $null
$wordAuditOwned = $false
try {
  $wordAuditApplication = New-Object -ComObject Word.Application
  $wordAuditNewProcesses = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $existingWordProcesses -notcontains $_.Id })
  if ($wordAuditNewProcesses.Count -ne 1 -or $wordAuditApplication.Documents.Count -ne 0) { throw 'Refusing to use an existing Word process or document.' }
  $wordAuditOwned = $true
  $wordAuditApplication.Visible = $false
  $wordAuditApplication.DisplayAlerts = 0
  $wordAuditApplication.AutomationSecurity = 3
  $wordAuditFalse = $false
  $wordAuditTrue = $true
  $wordAuditDocument = $wordAuditApplication.Documents.Open([ref]$wordDocumentPath, [ref]$wordAuditFalse, [ref]$wordAuditTrue, [ref]$wordAuditFalse)
  $wordAuditResults = @()
  foreach ($wordAuditRow in @(2,3,4,5,6)) {
    $wordAuditParagraph = $wordAuditDocument.Tables.Item(1).Cell($wordAuditRow,1).Range.Paragraphs.Item(1)
    $wordAuditText = $wordAuditParagraph.Range.Text.Trim([char]13,[char]7)
    $wordAuditExpectedAlignment = if ($wordAuditRow -in @(4,5)) { 0 } else { 2 }
    $wordAuditExpectedOrder = if ($wordAuditRow -in @(4,5)) { 1 } else { 0 }
    $wordAuditResult = [pscustomobject]@{ row=$wordAuditRow; text=$wordAuditText; alignment=$wordAuditParagraph.Format.Alignment; readingOrder=$wordAuditParagraph.Format.ReadingOrder }
    $wordAuditResults += $wordAuditResult
    if ($wordAuditResult.alignment -ne $wordAuditExpectedAlignment -or $wordAuditResult.readingOrder -ne $wordAuditExpectedOrder) { throw ('Native Word direction mismatch: ' + ($wordAuditResult | ConvertTo-Json -Compress)) }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordAuditParagraph)
  }
  $wordAuditResults | ConvertTo-Json -Depth 4
  $wordAuditEnglishOptions = 0
  foreach ($wordAuditParagraph in $wordAuditDocument.Paragraphs) {
    $wordAuditText = $wordAuditParagraph.Range.Text.Trim([char]13,[char]7)
    $wordAuditCleanText = $wordAuditText -replace '[\u202A-\u202E\u2066-\u2069]', ''
    if ($wordAuditCleanText -match '\) (?:Windows|Photoshop|Illustrator|CorelDRAW|Adobe Photoshop|CPU / GPU|https://)') {
      if ($wordAuditParagraph.Format.Alignment -ne 0 -or $wordAuditParagraph.Format.ReadingOrder -ne 1) { throw 'English option direction mismatch in native Word.' }
      $wordAuditEnglishOptions++
    }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordAuditParagraph)
  }
  if ($wordAuditEnglishOptions -ne 7) { throw 'Not all English options were verified.' }
  $wordAuditDocument.Content.Font.Name = 'Arial'
  $wordAuditDocument.Content.Font.NameBi = 'Arial'
  $wordAuditDocument.Content.Font.Size = 18
  $wordAuditDocument.Content.Font.SizeBi = 18
  foreach ($wordAuditRow in @(2,3,4,5,6)) {
    $wordAuditParagraph = $wordAuditDocument.Tables.Item(1).Cell($wordAuditRow,1).Range.Paragraphs.Item(1)
    $wordAuditExpectedAlignment = if ($wordAuditRow -in @(4,5)) { 0 } else { 2 }
    if ($wordAuditParagraph.Format.Alignment -ne $wordAuditExpectedAlignment) { throw 'Alignment changed after applying Arial 18.' }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordAuditParagraph)
  }
  Write-Output 'Native Word: 5 question directions, 7 English options and Arial 18 alignment verified.'
  $wordAuditSaveNone = 0
  $wordAuditDocument.Close([ref]$wordAuditSaveNone)
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordAuditDocument)
  $wordAuditDocument = $null
  $wordStressPath = [IO.Path]::Combine([IO.Path]::GetDirectoryName($wordDocumentPath), 'stress.docx')
  $wordStressSource = Get-Content -Encoding UTF8 -Raw -LiteralPath (Join-Path (Split-Path $wordDocumentPath) 'stress.json') | ConvertFrom-Json
  $wordAuditDocument = $wordAuditApplication.Documents.Open([ref]$wordStressPath, [ref]$wordAuditFalse, [ref]$wordAuditTrue, [ref]$wordAuditFalse)
  $wordStressTable = $wordAuditDocument.Tables.Item(1)
  if ($wordStressTable.Rows.Count -ne 82) { throw 'Questions were lost from the main Word table.' }
  if ($wordStressTable.Rows.Item(1).HeadingFormat -ne -1) { throw 'Continuation-page table header is not enabled.' }
  $wordStressText = $wordAuditDocument.Content.Text -replace '[\u202A-\u202E\u2066-\u2069]', ''
  if ($wordStressText.Contains('PRIVATE_')) { throw 'Answer key leaked into the student Word document.' }
  for ($wordStressIndex = 0; $wordStressIndex -lt 80; $wordStressIndex++) {
    $wordStressMarker = 'Q{0:D4}' -f ($wordStressIndex + 1)
    if ([regex]::Matches($wordStressText, $wordStressMarker).Count -ne 1) { throw ('Missing or repeated question: '+$wordStressMarker) }
    $wordStressCellText = $wordStressTable.Cell(($wordStressIndex+2),1).Range.Text -replace '[\u202A-\u202E\u2066-\u2069]', ''
    if (-not $wordStressCellText.Contains($wordStressMarker)) { throw 'Question ordering changed.' }
    $wordStressExpectedScore = ($wordStressSource.questions[$wordStressIndex].score/100).ToString('0.##',[Globalization.CultureInfo]::InvariantCulture)
    $wordStressScore = $wordStressTable.Cell(($wordStressIndex+2),2).Range.Text.Trim([char]13,[char]7) -replace '[\u202A-\u202E\u2066-\u2069]', ''
    $wordStressLatinScore = -join ($wordStressScore.ToCharArray() | ForEach-Object { if ([int]$_ -ge 1776 -and [int]$_ -le 1785) { [char]([int]$_-1728) } elseif ([int]$_ -eq 1643) { '.' } else { $_ } })
    if ($wordStressLatinScore -ne $wordStressExpectedScore) { throw ('Score changed for '+$wordStressMarker) }
  }
  $wordStressTotal = $wordStressTable.Cell(82,2).Range.Text.Trim([char]13,[char]7) -replace '[\u202A-\u202E\u2066-\u2069]', ''
  if ($wordStressTotal -ne $wordStressSource.total) { throw 'Total score is incorrect.' }
  if ($wordStressTable.Cell(2,1).Width -lt 5*$wordStressTable.Cell(2,2).Width) { throw 'Question and score column widths are incorrect.' }
  $wordAuditDocument.Repaginate()
  $wordStressPages = $wordAuditDocument.ComputeStatistics(2)
  if ($wordStressPages -lt 2) { throw 'Stress fixture did not exercise continuation pages.' }
  Write-Output ('Native Word: 80 ordered questions, exact scores and total, no answer leakage, repeated header and '+$wordStressPages+' pages verified.')
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordStressTable)
  $wordAuditDocument.Close([ref]$wordAuditSaveNone)
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordAuditDocument)
  $wordAuditDocument = $null
  $wordEdgePath = [IO.Path]::Combine([IO.Path]::GetDirectoryName($wordDocumentPath), 'edge.docx')
  $wordEdgeSource = Get-Content -Encoding UTF8 -Raw -LiteralPath (Join-Path (Split-Path $wordDocumentPath) 'edge.json') | ConvertFrom-Json
  $wordAuditDocument = $wordAuditApplication.Documents.Open([ref]$wordEdgePath, [ref]$wordAuditFalse, [ref]$wordAuditTrue, [ref]$wordAuditFalse)
  $wordEdgeTable = $wordAuditDocument.Tables.Item(1)
  if ($wordEdgeTable.Rows.Count -ne $wordEdgeSource.questions.Count+2) { throw 'Edge fixture lost question rows.' }
  if ($wordAuditDocument.Content.Text.Contains('PRIVATE_')) { throw 'Answer key leaked into the edge Word document.' }
  foreach ($wordEdgeExpected in $wordEdgeSource.paragraphs) {
    $wordEdgeFound = $false
    foreach ($wordEdgeParagraph in $wordEdgeTable.Cell($wordEdgeExpected.row,1).Range.Paragraphs) {
      $wordEdgeParagraphText = $wordEdgeParagraph.Range.Text.Trim([char]13,[char]7) -replace '[\u202A-\u202E\u2066-\u2069]', ''
      if ($wordEdgeParagraphText -ceq $wordEdgeExpected.text) {
        $wordEdgeFound = $true
        $wordEdgeAlignment = if ($wordEdgeExpected.dir -eq 'rtl') { 2 } else { 0 }
        $wordEdgeReadingOrder = if ($wordEdgeExpected.dir -eq 'rtl') { 0 } else { 1 }
        if ($wordEdgeParagraph.Format.Alignment -ne $wordEdgeAlignment -or $wordEdgeParagraph.Format.ReadingOrder -ne $wordEdgeReadingOrder) { throw ('Code or bilingual paragraph direction changed: '+$wordEdgeExpected.text) }
      }
      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordEdgeParagraph)
    }
    if (-not $wordEdgeFound) { throw ('Missing, reordered, or non-independent edge paragraph: '+$wordEdgeExpected.text) }
  }
  for ($wordEdgeIndex=0; $wordEdgeIndex -lt $wordEdgeSource.questions.Count; $wordEdgeIndex++) {
    $wordEdgeQuestion = $wordEdgeSource.questions[$wordEdgeIndex]
    $wordEdgeCellText = $wordEdgeTable.Cell(($wordEdgeIndex+2),1).Range.Text -replace '[\u202A-\u202E\u2066-\u2069]', ''
    foreach ($wordEdgeSourceText in (@($wordEdgeQuestion.text)+@($wordEdgeQuestion.options))) {
      foreach ($wordEdgeLine in ($wordEdgeSourceText -split '\r\n|\r|\n')) {
        if ($wordEdgeLine -and -not $wordEdgeCellText.Contains($wordEdgeLine)) { throw ('Question or option text was changed in edge row '+($wordEdgeIndex+2)) }
      }
    }
    $wordEdgeExpectedScore = ($wordEdgeQuestion.score/100).ToString('0.##',[Globalization.CultureInfo]::InvariantCulture)
    $wordEdgeScore = $wordEdgeTable.Cell(($wordEdgeIndex+2),2).Range.Text.Trim([char]13,[char]7) -replace '[\u202A-\u202E\u2066-\u2069]', ''
    $wordEdgeLatinScore = -join ($wordEdgeScore.ToCharArray() | ForEach-Object { if ([int]$_ -ge 1776 -and [int]$_ -le 1785) { [char]([int]$_-1728) } elseif ([int]$_ -eq 1643) { '.' } else { $_ } })
    if ($wordEdgeLatinScore -ne $wordEdgeExpectedScore) { throw ('Score changed for edge row '+($wordEdgeIndex+2)) }
  }
  $wordEdgeTotal = $wordEdgeTable.Cell(($wordEdgeSource.questions.Count+2),2).Range.Text.Trim([char]13,[char]7) -replace '[\u202A-\u202E\u2066-\u2069]', ''
  if ($wordEdgeTotal -ne $wordEdgeSource.total) { throw 'Edge fixture total score is incorrect.' }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordEdgeTable)
  Write-Output 'Native Word: code with Persian strings, multiline options, English blank label, inline true/false, exact text and scores verified.'
} finally {
  $wordAuditSaveNone = 0
  if ($wordAuditDocument) { $wordAuditDocument.Close([ref]$wordAuditSaveNone); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordAuditDocument) }
  if ($wordAuditApplication) { if ($wordAuditOwned) { $wordAuditApplication.Quit() }; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordAuditApplication) }
}
