// Minimal SpreadsheetML/ZIP writer: local only, no formulas, macros or external links.
// Package structure: https://learn.microsoft.com/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document
function xlsxWorkbook(sheets) {
  const encoder = new TextEncoder();
  const xml = (value) =>
    String(value)
      .replace(/_x[0-9a-f]{4}_/gi, (text) => "_x005F_" + text.slice(1))
      .replace(
        // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these code points.
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,
        (text) => "_x" + text.charCodeAt(0).toString(16).padStart(4, "0") + "_",
      )
      .replace(
        /[&<>"']/g,
        (text) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&apos;",
          })[text],
      );
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rel =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const column = (index) => {
    let result = "";
    for (let n = index + 1; n; n = Math.floor((n - 1) / 26))
      result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
    return result;
  };
  const entries = [];
  const add = (name, content) =>
    entries.push([encoder.encode(name), encoder.encode(declaration + content)]);
  if (!sheets.length || sheets.length > 100)
    throw Error("تعداد برگه‌های اکسل معتبر نیست.");
  const names = new Set();
  for (const [index, sheet] of sheets.entries()) {
    if (
      !sheet.name ||
      sheet.name.length > 31 ||
      /[\\/?*[\]:]/.test(sheet.name) ||
      names.has(sheet.name.toLowerCase()) ||
      /^\x27|\x27$/.test(sheet.name)
    )
      throw Error("نام برگهٔ اکسل معتبر نیست.");
    names.add(sheet.name.toLowerCase());
    const banner = sheet.banner || [];
    const headerRow = banner.length ? banner.length + 1 : 1;
    const rowOffset = headerRow - 1;
    if (!sheet.rows.length || sheet.rows.length + rowOffset > 1048576)
      throw Error(
        "تعداد ردیف‌ها بیش از ظرفیت اکسل است؛ محدوده گزارش را کوچک‌تر کنید.",
      );
    const width = Math.max(...sheet.rows.slice(0, 1).map((row) => row.length));
    if (!width || width > 16384) throw Error("تعداد ستون‌های اکسل معتبر نیست.");
    const range = "A1:" + column(width - 1) + (sheet.rows.length + rowOffset);
    const rows = sheet.rows
      .map((row, ri) => {
        if (row.length > width)
          throw Error("ستون‌های گزارش با عنوان‌ها یکسان نیستند.");
        return (
          '<row r="' +
          (ri + 1 + rowOffset) +
          '"' +
          (ri === 0 ? ' ht="30" customHeight="1"' : "") +
          ">" +
          row
            .map((value, ci) => {
              if (value == null || value === "") return "";
              const ref = column(ci) + (ri + 1 + rowOffset);
              let style = ri === 0 ? 1 : ri % 2 ? 0 : 2;
              if (ri && typeof value === "number") style = ri % 2 ? 3 : 4;
              if (ri && String(sheet.rows[0][ci]).startsWith("وضعیت")) {
                if (["قبول", "تکمیل", "حاضر"].includes(value)) style = 5;
                else if (value === "غایب") style = 7;
                else if (value) style = 6;
              }
              if (typeof value === "number") {
                if (!Number.isFinite(value))
                  throw Error("مقدار عددی گزارش معتبر نیست.");
                return (
                  '<c r="' +
                  ref +
                  '" s="' +
                  style +
                  '"><v>' +
                  value +
                  "</v></c>"
                );
              }
              const text = String(value);
              if (text.length > 32767)
                throw Error(
                  "متن یک سلول بیش از ظرفیت اکسل است؛ از خروجی متن یا JSON استفاده کنید.",
                );
              return (
                '<c r="' +
                ref +
                '" s="' +
                style +
                '" t="inlineStr"><is><t xml:space="preserve">' +
                xml(text) +
                "</t></is></c>"
              );
            })
            .join("") +
          "</row>"
        );
      })
      .join("");
    const columnWidths = sheet.rows[0].map((header, ci) => {
      if (sheet.widths?.[ci]) return sheet.widths[ci];
      let longest = String(header).length;
      for (const row of sheet.rows.slice(1, 201))
        longest = Math.max(longest, String(row[ci] ?? "").length);
      return Math.min(45, Math.max(14, Math.ceil(longest * 1.15) + 3));
    });
    const columns = sheet.rows[0]
      .map(
        (_, i) =>
          '<col min="' +
          (i + 1) +
          '" max="' +
          (i + 1) +
          '" width="' +
          columnWidths[i] +
          '" customWidth="1"/>',
      )
      .join("");
    const bannerRows = banner
      .map((text, i) => {
        if (String(text).length > 32767)
          throw Error("سربرگ گزارش بیش از ظرفیت اکسل است.");
        return (
          '<row r="' +
          (i + 1) +
          '" ht="' +
          (i === 0
            ? 30
            : Math.min(
                409,
                Math.max(
                  26,
                  Math.ceil(
                    String(text).length /
                      Math.max(
                        18,
                        columnWidths.reduce((sum, value) => sum + value, 0) *
                          0.8,
                      ),
                  ) *
                    18 +
                    10,
                ),
              )) +
          '" customHeight="1"><c r="A' +
          (i + 1) +
          '" s="' +
          (i === 0 ? 8 : 9) +
          '" t="inlineStr"><is><t xml:space="preserve">' +
          xml(text) +
          "</t></is></c></row>"
        );
      })
      .join("");
    add(
      "xl/worksheets/sheet" + (index + 1) + ".xml",
      '<worksheet xmlns="' +
        ns +
        '"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="' +
        range +
        '"/><sheetViews><sheetView rightToLeft="1" showGridLines="0" workbookViewId="0"><pane ySplit="' +
        headerRow +
        '" topLeftCell="A' +
        (headerRow + 1) +
        '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A' +
        (headerRow + 1) +
        '" sqref="A' +
        (headerRow + 1) +
        '"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols>' +
        columns +
        "</cols><sheetData>" +
        bannerRows +
        rows +
        "</sheetData>" +
        (sheet.filter === false
          ? ""
          : '<autoFilter ref="A' +
            headerRow +
            ":" +
            column(width - 1) +
            (sheet.rows.length + rowOffset) +
            '"/>') +
        (banner.length && width > 1
          ? '<mergeCells count="' +
            banner.length +
            '">' +
            banner
              .map(
                (_, i) =>
                  '<mergeCell ref="A' +
                  (i + 1) +
                  ":" +
                  column(width - 1) +
                  (i + 1) +
                  '"/>',
              )
              .join("") +
            "</mergeCells>"
          : "") +
        '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="' +
        (width > 7 ? "landscape" : "portrait") +
        '" fitToWidth="1" fitToHeight="0"/><headerFooter><oddHeader>&amp;R&amp;A&amp;Lکلاس‌یار</oddHeader><oddFooter>&amp;Cصفحه &amp;P از &amp;N</oddFooter></headerFooter></worksheet>',
    );
  }
  add(
    "xl/workbook.xml",
    '<workbook xmlns="' +
      ns +
      '" xmlns:r="' +
      rel +
      '"><bookViews><workbookView/></bookViews><sheets>' +
      sheets
        .map(
          (sheet, i) =>
            '<sheet name="' +
            xml(sheet.name) +
            '" sheetId="' +
            (i + 1) +
            '" r:id="rId' +
            (i + 1) +
            '"/>',
        )
        .join("") +
      "</sheets><definedNames>" +
      sheets
        .map(
          (sheet, i) =>
            '<definedName name="_xlnm.Print_Titles" localSheetId="' +
            i +
            '">' +
            xml(
              "'" +
                sheet.name.replace(/'/g, "''") +
                "'!$1:$" +
                (sheet.banner?.length ? sheet.banner.length + 1 : 1),
            ) +
            "</definedName>",
        )
        .join("") +
      "</definedNames></workbook>",
  );
  add(
    "xl/_rels/workbook.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, i) =>
            '<Relationship Id="rId' +
            (i + 1) +
            '" Type="' +
            rel +
            '/worksheet" Target="worksheets/sheet' +
            (i + 1) +
            '.xml"/>',
        )
        .join("") +
      '<Relationship Id="rIdStyles" Type="' +
      rel +
      '/styles" Target="styles.xml"/></Relationships>',
  );
  add(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' +
      rel +
      '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  add(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            '<Override PartName="/xl/worksheets/sheet' +
            (i + 1) +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
        )
        .join("") +
      "</Types>",
  );
  add(
    "xl/styles.xml",
    '<styleSheet xmlns="' +
      ns +
      '"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.##"/></numFmts><fonts count="4"><font><sz val="11"/><color rgb="FF25344A"/><name val="Tahoma"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font><font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font><font><sz val="11"/><color rgb="FF475569"/><name val="Tahoma"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      ["FF244B73", "FFF0F5FA", "FFE4F4EA", "FFFFF3D6", "FFFCE8E6", "FFEAF0F8"]
        .map(
          (color) =>
            '<fill><patternFill patternType="solid"><fgColor rgb="' +
            color +
            '"/><bgColor indexed="64"/></patternFill></fill>',
        )
        .join("") +
      '</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10">' +
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map(
          (i) =>
            '<xf numFmtId="' +
            (i === 3 || i === 4 ? 164 : 0) +
            '" fontId="' +
            (i === 8 ? 2 : i === 9 ? 3 : i === 1 ? 1 : 0) +
            '" fillId="' +
            [0, 2, 3, 0, 3, 4, 5, 6, 2, 7][i] +
            '" borderId="0" xfId="0" applyAlignment="1" applyFill="1" applyNumberFormat="1"><alignment horizontal="' +
            (i === 3 || i === 4 ? "center" : "right") +
            '" vertical="center" wrapText="1" readingOrder="2"/></xf>',
        )
        .join("") +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );
  const table = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const crc = (bytes) => {
    let value = 0xffffffff;
    for (const byte of bytes)
      value = table[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunks = [],
    directory = [];
  let offset = 0,
    directorySize = 0;
  for (const [name, bytes] of entries) {
    if (offset + bytes.length > 128 * 1024 * 1024)
      throw Error("حجم اکسل زیاد است؛ محدوده گزارش را کوچک‌تر کنید.");
    const checksum = crc(bytes);
    const header = new Uint8Array(30),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(12, 33, true);
    h.setUint32(14, checksum, true);
    h.setUint32(18, bytes.length, true);
    h.setUint32(22, bytes.length, true);
    h.setUint16(26, name.length, true);
    chunks.push(header, name, bytes);
    const central = new Uint8Array(46),
      c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, checksum, true);
    c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    directory.push(central, name);
    directorySize += central.length + name.length;
    offset += header.length + name.length + bytes.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
