(function (root) {
  "use strict";
  const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const xml = (value) =>
    String(value)
      // eslint-disable-next-line no-control-regex -- XML 1.0 disallows these control characters.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
      .replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&apos;",
          })[c],
      );
  const number = (value) =>
    new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value);
  // Word/clipboard text may contain invisible embedding/override characters.
  // Direction is owned by OOXML runs, not unbalanced controls inside user text.
  const cleanDirectionControls = (text) =>
    String(text).replace(/[\u202a-\u202e\u2066-\u2069]/g, "");
  const rtlLetter = (char) =>
    /\p{Letter}/u.test(char) &&
    /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(char);
  function direction(text, fallback = "rtl") {
    // A Latin term at the beginning (e.g. "CPU چیست؟") is not an English question.
    const chars = Array.from(cleanDirectionControls(text));
    if (chars.some(rtlLetter)) return "rtl";
    return chars.some((char) => /\p{Letter}/u.test(char)) ? "ltr" : fallback;
  }
  function run(text, bold = false, dir = "rtl") {
    // Keep explicit line breaks; never interpret question text as OOXML.
    return (
      "<w:r><w:rPr>" +
      (bold ? "<w:b/><w:bCs/>" : "") +
      '<w:rtl w:val="' +
      (dir === "rtl" ? "1" : "0") +
      '"/><w:lang w:val="' +
      (dir === "rtl" ? "fa-IR" : "en-US") +
      '" w:bidi="fa-IR"/></w:rPr>' +
      String(text)
        .split(/\r\n|\r|\n/)
        .map(
          (line, i) =>
            (i ? "<w:br/>" : "") +
            '<w:t xml:space="preserve">' +
            xml(line) +
            "</w:t>",
        )
        .join("") +
      "</w:r>"
    );
  }
  function mixedRuns(text, bold, baseDirection) {
    const chars = Array.from(cleanDirectionControls(text)),
      dirs = chars.map((char) =>
        rtlLetter(char) || /[\u0660-\u0669\u06f0-\u06f9]/u.test(char)
          ? "rtl"
          : /[\p{Letter}\p{Number}]/u.test(char)
            ? "ltr"
            : null,
      );
    for (let i = 0; i < dirs.length;) {
      if (dirs[i]) {
        i++;
        continue;
      }
      const start = i;
      while (i < dirs.length && !dirs[i]) i++;
      const before = dirs[start - 1],
        after = dirs[i],
        neutral = chars.slice(start, i).join("");
      const resolved =
        before && before === after
          ? before
          : /[()[\]{}<>:/\\@._+\-=?!%]/.test(neutral) &&
              !/[،؛؟]/.test(neutral) &&
              (before === "ltr" || after === "ltr")
            ? "ltr"
            : baseDirection;
      for (let n = start; n < i; n++) dirs[n] = resolved;
    }
    let result = "";
    for (let i = 0; i < chars.length;) {
      const start = i,
        dir = dirs[i];
      while (i < chars.length && dirs[i] === dir) i++;
      // Word reorders explicit w:dir embeddings as units, which can detach a
      // Latin word from the Persian text around it. Keep sibling runs in their
      // logical source order and let the paragraph's bidi algorithm order them.
      result += run(chars.slice(start, i).join(""), bold, dir);
    }
    return result || run("", bold, baseDirection);
  }
  const paragraph = (
    text,
    { bold = false, center = false, dir = direction(text) } = {},
  ) =>
    '<w:p><w:pPr><w:pStyle w:val="Normal"/>' +
    '<w:bidi w:val="' +
    (dir === "rtl" ? "1" : "0") +
    '"/><w:spacing w:after="100" w:line="300" w:lineRule="auto"/><w:jc w:val="' +
    // Word mirrors left/right justification when bidi is enabled. "left"
    // yields physical right alignment for RTL and physical left for LTR.
    (center ? "center" : "left") +
    '"/></w:pPr>' +
    mixedRuns(text, bold, dir) +
    "</w:p>";
  const cell = (body, width, shade = false) =>
    '<w:tc><w:tcPr><w:tcW w:w="' +
    width +
    '" w:type="pct"/>' +
    (shade ? '<w:shd w:fill="F1F3F5"/>' : "") +
    '<w:vAlign w:val="top"/></w:tcPr>' +
    body +
    "</w:tc>";
  function documentXml(exam) {
    if (
      !exam ||
      !Array.isArray(exam.questions) ||
      !exam.questions.length ||
      exam.questions.length > 500
    )
      throw Error("آزمون باید بین ۱ و ۵۰۰ سؤال داشته باشد.");
    let total = 0;
    const rows = Array.from(exam.questions)
      .map((q, i) => {
        if (
          !q ||
          typeof q.text !== "string" ||
          !q.text.trim() ||
          q.text.length > 10000 ||
          !["mcq", "boolean", "blank", "essay"].includes(q.type) ||
          !Number.isSafeInteger(q.score) ||
          q.score < 1 ||
          q.score > 10000
        )
          throw Error("متن، نوع یا بارم سؤال برای خروجی Word معتبر نیست.");
        total += q.score;
        const questionDirection = direction(q.text);
        let body = paragraph(
          (questionDirection === "rtl" ? number(i + 1) : String(i + 1)) +
            ". " +
            q.text +
            (q.type === "boolean"
              ? questionDirection === "rtl"
                ? "    □ صحیح    □ غلط"
                : "    □ True    □ False"
              : ""),
          { dir: questionDirection },
        );
        if (q.type === "mcq") {
          if (
            !Array.isArray(q.options) ||
            q.options.length !== 4 ||
            Array.from(q.options).some(
              (o) => typeof o !== "string" || !o.trim() || o.length > 2000,
            )
          )
            throw Error("چهار گزینهٔ معتبر برای سؤال لازم است.");
          const columns = q.options.every(
            (o) => !/[\r\n]/.test(o) && Array.from(o).length <= 26,
          )
            ? 4
            : 2;
          const optionWidth = Math.floor(9500 / columns);
          let optionRows = "";
          for (let index = 0; index < 4; index += columns) {
            optionRows +=
              "<w:tr><w:trPr><w:cantSplit/></w:trPr>" +
              q.options
                .slice(index, index + columns)
                .map((option, j) =>
                  cell(
                    paragraph(
                      (questionDirection === "rtl"
                        ? ["الف", "ب", "ج", "د"][index + j]
                        : ["A", "B", "C", "D"][index + j]) +
                        ") " +
                        option,
                      { dir: direction(option, questionDirection) },
                    ),
                    5000 / columns,
                  ),
                )
                .join("") +
              "</w:tr>";
          }
          body +=
            '<w:tbl><w:tblPr><w:bidiVisual w:val="' +
            (questionDirection === "rtl" ? "1" : "0") +
            '"/><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' +
            Array.from(
              { length: columns },
              () => '<w:gridCol w:w="' + optionWidth + '"/>',
            ).join("") +
            "</w:tblGrid>" +
            optionRows +
            "</w:tbl><w:p/>";
        }
        if (q.type === "blank" && !/_{2,}|…|\.{3,}|ـ{3,}/u.test(q.text))
          body += paragraph(
            questionDirection === "rtl" ? "پاسخ: " : "Answer: ",
            { dir: questionDirection },
          );
        if (q.type === "essay")
          for (let line = 0; line < 4; line++)
            body += paragraph("", { dir: questionDirection });
        return (
          "<w:tr><w:trPr>" +
          (q.text.length + (q.options || []).join("").length < 1200
            ? "<w:cantSplit/>"
            : "") +
          "</w:trPr>" +
          cell(body, 4450) +
          cell(paragraph(number(q.score / 100), { center: true }), 550) +
          "</w:tr>"
        );
      })
      .join("");
    const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map(
        (side) => "<w:" + side + ' w:val="single" w:sz="4" w:color="A8AFB8"/>',
      )
      .join("");
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="' +
      NS +
      '"><w:body><w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' +
      borders +
      '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="9500"/><w:gridCol w:w="1138"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' +
      cell(paragraph("سؤال‌ها", { bold: true }), 4450, true) +
      cell(paragraph("بارم", { bold: true, center: true }), 550, true) +
      "</w:tr>" +
      rows +
      "<w:tr><w:trPr><w:cantSplit/></w:trPr>" +
      cell(paragraph("جمع بارم", { bold: true }), 4450) +
      cell(paragraph(number(total / 100), { bold: true, center: true }), 550) +
      '</w:tr></w:tbl><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="634" w:bottom="720" w:left="634" w:header="0" w:footer="0"/><w:bidi/></w:sectPr></w:body></w:document>'
    );
  }
  // Small stored ZIP writer for real, offline DOCX packages (not renamed HTML).
  function zip(files) {
    const encoder = new TextEncoder(),
      parts = [],
      directory = [];
    let offset = 0,
      size = 0;
    const table = Uint32Array.from({ length: 256 }, (_, n) => {
      for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
      return n >>> 0;
    });
    for (const [name, text] of Object.entries(files)) {
      const filename = encoder.encode(name),
        data = encoder.encode(text);
      let crc = 0xffffffff;
      for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
      crc = (crc ^ 0xffffffff) >>> 0;
      const header = new Uint8Array(30),
        h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 0x800, true);
      h.setUint16(12, 33, true);
      h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true);
      h.setUint32(22, data.length, true);
      h.setUint16(26, filename.length, true);
      parts.push(header, filename, data);
      const entry = new Uint8Array(46),
        d = new DataView(entry.buffer);
      d.setUint32(0, 0x02014b50, true);
      d.setUint16(4, 20, true);
      d.setUint16(6, 20, true);
      d.setUint16(8, 0x800, true);
      d.setUint16(14, 33, true);
      d.setUint32(16, crc, true);
      d.setUint32(20, data.length, true);
      d.setUint32(24, data.length, true);
      d.setUint16(28, filename.length, true);
      d.setUint32(42, offset, true);
      directory.push(entry, filename);
      offset += header.length + filename.length + data.length;
      size += entry.length + filename.length;
    }
    const end = new Uint8Array(22),
      e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, directory.length / 2, true);
    e.setUint16(10, directory.length / 2, true);
    e.setUint32(12, size, true);
    e.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: MIME });
  }
  function create(exam) {
    const declaration =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return zip({
      "[Content_Types].xml":
        declaration +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      "_rels/.rels":
        declaration +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      "word/document.xml": documentXml(exam),
      "word/_rels/document.xml.rels":
        declaration +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      "word/styles.xml":
        declaration +
        '<w:styles xmlns:w="' +
        NS +
        '"><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="fa-IR" w:bidi="fa-IR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>',
    });
  }
  function filename(exam) {
    const safe = (value) =>
      String(value || "آزمون")
        .replace(
          // eslint-disable-next-line no-control-regex -- Strip forbidden filename characters and direction overrides.
          /[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
          "-",
        )
        .replace(/[.\s]+$/g, "")
        .slice(0, 60) || "آزمون";
    return (
      safe(exam.courseTitle) + " - " + safe(exam.title) + " - بدون سربرگ.docx"
    );
  }
  function download(exam) {
    const blob = create(exam),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = filename(exam);
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      root.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }
  root.EduQuestionBankSchoolWord = Object.freeze({
    create,
    filename,
    documentXml,
    download,
  });
})(globalThis);
