"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

// Uses Windows' built-in PDF renderer. No browser screenshot, network or install.
// Only synthetic audit output under the OS temporary directory is written.
const renderScript = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class EduPdfRasterInk {
  public static Dictionary<string,object> Inspect(string file) {
    using(var image=new Bitmap(file)) {
      int width=image.Width,height=image.Height,left=width,top=height,right=-1,bottom=-1,pixels=0,pale=0;
      var data=image.LockBits(new Rectangle(0,0,width,height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
      var buffer=new byte[Math.Abs(data.Stride)*height];Marshal.Copy(data.Scan0,buffer,0,buffer.Length);
      var rules=new List<int>();
      try {
        for(int y=0;y<height;y++){
          int row=0;
          for(int x=0;x<width;x++){
            int offset=y*Math.Abs(data.Stride)+x*4;
            if(buffer[offset+3]<128)continue;
            int minimum=Math.Min(buffer[offset],Math.Min(buffer[offset+1],buffer[offset+2]));
            if(minimum>=230 && minimum<248)pale++;
            if(minimum>=210)continue;
            pixels++;row++;left=Math.Min(left,x);right=Math.Max(right,x);top=Math.Min(top,y);bottom=Math.Max(bottom,y);
          }
          if(row>width*.65)rules.Add(y);
        }
      } finally {image.UnlockBits(data);}
      return new Dictionary<string,object>{
        {"width",width},{"height",height},{"inkPixels",pixels},
        {"leftMargin",left},{"rightMargin",width-right-1},{"topMargin",top},{"bottomMargin",height-bottom-1},
        {"paleBackgroundFraction",pale/(double)(width*height)},{"horizontalRules",rules.ToArray()}
      };
    }
  }
}
'@
$pdfOperationMethod=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name.StartsWith('IAsyncOperation') } | Select-Object -First 1
$pdfActionMethod=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.FullName -eq 'Windows.Foundation.IAsyncAction' } | Select-Object -First 1
function Wait-PdfOperation($operation,[Type]$resultType) { $pdfOperationMethod.MakeGenericMethod($resultType).Invoke($null,@($operation)).GetAwaiter().GetResult() }
$pdfFileType=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$pdfDocumentType=[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]
$pdfStreamType=[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$pdfFile=Wait-PdfOperation ($pdfFileType::GetFileFromPathAsync($env:EDU_AUDIT_PDF_INPUT)) $pdfFileType
$pdfDocument=Wait-PdfOperation ($pdfDocumentType::LoadFromFileAsync($pdfFile)) $pdfDocumentType
$pdfPages=@()
for($pdfIndex=0;$pdfIndex -lt $pdfDocument.PageCount;$pdfIndex++){
  $pdfPage=$pdfDocument.GetPage($pdfIndex)
  $pdfOutput=Join-Path $env:EDU_AUDIT_PDF_OUTPUT ('page-{0:D3}.png' -f ($pdfIndex+1))
  [System.IO.File]::WriteAllBytes($pdfOutput,[byte[]]@())
  $pdfOutputFile=Wait-PdfOperation ($pdfFileType::GetFileFromPathAsync($pdfOutput)) $pdfFileType
  $pdfOutputStream=Wait-PdfOperation ($pdfOutputFile.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) $pdfStreamType
  try {
    $pdfOptions=New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $pdfOptions.DestinationWidth=[uint32]$env:EDU_AUDIT_PDF_WIDTH
    $pdfOptions.DestinationHeight=[uint32][Math]::Round($pdfOptions.DestinationWidth*$pdfPage.Size.Height/$pdfPage.Size.Width)
    $pdfAction=$pdfPage.RenderToStreamAsync($pdfOutputStream,$pdfOptions)
    $null=$pdfActionMethod.Invoke($null,@($pdfAction)).GetAwaiter().GetResult()
    $pdfOutputStream.Dispose()
    $pdfOutputStream=$null
    $pdfPages+=@{file=$pdfOutput;widthPoints=$pdfPage.Size.Width*.75;heightPoints=$pdfPage.Size.Height*.75;ink=[EduPdfRasterInk]::Inspect($pdfOutput)}
  } finally {if($pdfOutputStream){$pdfOutputStream.Dispose()};$pdfPage.Dispose()}
}
@{renderer='Windows.Data.Pdf';source=$env:EDU_AUDIT_PDF_INPUT;pageCount=$pdfDocument.PageCount;pages=$pdfPages} | ConvertTo-Json -Depth 7 -Compress
`;

function rasterizePdf(input, outputDirectory, width = 1684) {
  if (process.platform !== "win32")
    throw Error("This offline audit renderer requires Windows.Data.Pdf.");
  const source = path.resolve(input);
  if (!fs.existsSync(source))
    throw Error("Synthetic audit PDF does not exist.");
  const output = path.resolve(
    outputDirectory ||
      fs.mkdtempSync(path.join(os.tmpdir(), "edu-pdf-raster-")),
  );
  const relative = path.relative(path.resolve(os.tmpdir()), output);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw Error(
      "PDF audit raster output must be a child of the OS temp directory.",
    );
  if (!Number.isInteger(width) || width < 800 || width > 2400)
    throw Error("PDF raster width must be an integer between 800 and 2400.");
  fs.mkdirSync(output, { recursive: true });
  const processResult = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(renderScript, "utf16le").toString("base64"),
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        EDU_AUDIT_PDF_INPUT: source,
        EDU_AUDIT_PDF_OUTPUT: output,
        EDU_AUDIT_PDF_WIDTH: String(width),
      },
    },
  );
  if (processResult.error) throw processResult.error;
  if (processResult.status !== 0)
    throw Error(processResult.stderr || "Windows PDF rasterization failed.");
  return JSON.parse(processResult.stdout.replace(/^\uFEFF/, "").trim());
}
module.exports = { rasterizePdf };
if (require.main === module)
  process.stdout.write(
    JSON.stringify(rasterizePdf(process.argv[2], process.argv[3]), null, 2) +
      "\n",
  );
