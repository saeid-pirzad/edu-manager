"use strict";
// Independent reader for generated XLSX in Windows audit profiles; it never uses the writer.
const { execFileSync } = require("node:child_process");
module.exports = function readWorkbook(filename) {
  const script = [
    "$ErrorActionPreference='Stop'",
    "[Console]::OutputEncoding=[Text.UTF8Encoding]::new()",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "$zip=[IO.Compression.ZipFile]::OpenRead($env:EDU_XLSX_READ)",
    "$sheets=@(); $sheetNames=@{}",
    "$reader=[IO.StreamReader]::new($zip.GetEntry('xl/workbook.xml').Open()); try { [xml]$book=$reader.ReadToEnd() } finally {$reader.Dispose()}",
    "$reader=[IO.StreamReader]::new($zip.GetEntry('xl/_rels/workbook.xml.rels').Open()); try { [xml]$rels=$reader.ReadToEnd() } finally {$reader.Dispose()}",
    "$targets=@{}; foreach($relation in $rels.Relationships.Relationship){$targets[$relation.Id]='xl/'+$relation.Target}",
    "$bn=[Xml.XmlNamespaceManager]::new($book.NameTable); $bn.AddNamespace('s','http://schemas.openxmlformats.org/spreadsheetml/2006/main')",
    "foreach($sheet in $book.SelectNodes('//s:sheets/s:sheet',$bn)){$rid=$sheet.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships'); $sheetNames[$targets[$rid]]=$sheet.GetAttribute('name')}",
    "try { foreach($entry in $zip.Entries) {",
    "if($entry.FullName -notmatch '^xl/worksheets/sheet[0-9]+\\.xml$'){continue}",
    "$reader=[IO.StreamReader]::new($entry.Open())",
    "try { [xml]$doc=$reader.ReadToEnd() } finally {$reader.Dispose()}",
    "$ns=[Xml.XmlNamespaceManager]::new($doc.NameTable)",
    "$ns.AddNamespace('s','http://schemas.openxmlformats.org/spreadsheetml/2006/main')",
    "$rows=@(); $seen=[Collections.Generic.HashSet[string]]::new(); $lastRow=0",
    "foreach($row in $doc.SelectNodes('//s:sheetData/s:row',$ns)){",
    "$rowNumber=[int]$row.GetAttribute('r'); if($rowNumber -le $lastRow){throw 'Unordered or duplicate row'}; $lastRow=$rowNumber",
    "$cells=@{}",
    "foreach($cell in $row.SelectNodes('s:c',$ns)){",
    "$address=$cell.GetAttribute('r')",
    "if($address -notmatch '^([A-Z]+)([0-9]+)$' -or [int]$Matches[2] -ne $rowNumber){throw ('Cell/row mismatch: '+$address+' in '+$rowNumber)}",
    "if(-not $seen.Add($address)){throw ('Duplicate cell: '+$address)}",
    "$text=$cell.SelectSingleNode('s:is/s:t',$ns); $value=$cell.SelectSingleNode('s:v',$ns)",
    "if($null -ne $text){$cells[$address]=$text.InnerText} elseif($null -ne $value){$cells[$address]=$value.InnerText}",
    "}",
    "$rows+=@{number=$rowNumber;cells=$cells}",
    "}",
    "$sheets+=@{part=$entry.FullName;name=$sheetNames[$entry.FullName];rows=$rows}",
    "}",
    "@{sheets=$sheets}|ConvertTo-Json -Depth 9 -Compress",
    "} finally {$zip.Dispose()}",
  ].join("\n");
  return JSON.parse(
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        windowsHide: true,
        env: { ...process.env, EDU_XLSX_READ: filename },
        maxBuffer: 8 * 1024 * 1024,
      },
    ),
  );
};
