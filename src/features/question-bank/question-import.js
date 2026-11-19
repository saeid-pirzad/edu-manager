(function (root) {
  "use strict";
  const D = root.EduQuestionBank;
  const headers = [
    "نوع سؤال",
    "متن سؤال",
    "گزینه ۱",
    "گزینه ۲",
    "گزینه ۳",
    "گزینه ۴",
    "پاسخ صحیح",
    "بارم",
    "توضیح پاسخ",
  ];
  const sheetName = "سؤال‌ها";
  const MAX_ROWS = 1000,
    MAX_FILE = 5 * 1024 * 1024,
    MAX_EXPANDED = 20 * 1024 * 1024;
  const fail = (message) => {
    throw Error(message);
  };
  const examples = [
    [
      "چهارگزینه‌ای",
      "حاصل ۲ + ۲ کدام است؟",
      "۱",
      "۲",
      "۳",
      "۴",
      "۴",
      "۱",
      "گزینهٔ چهارم صحیح است.",
    ],
    [
      "صحیح / غلط",
      "آب در شرایط معمول در دمای صفر درجه یخ می‌زند.",
      "",
      "",
      "",
      "",
      "صحیح",
      "۰٫۵",
      "",
    ],
    [
      "جای‌خالی",
      "پایتخت ایران ........ است.",
      "",
      "",
      "",
      "",
      "تهران",
      "۱",
      "",
    ],
    [
      "تشریحی",
      "دو روش صرفه‌جویی در مصرف آب را بنویسید.",
      "",
      "",
      "",
      "",
      "بستن شیر آب هنگام مسواک‌زدن و رفع نشتی شیرها.",
      "۲",
      "هر مورد درست یک نمره دارد.",
    ],
  ];
  function templateSheets() {
    return [
      {
        name: sheetName,
        rows: [headers, Array(9).fill("")],
        entryRows: 1000,
        widths: [23, 60, 25, 25, 25, 25, 44, 12, 48],
        columnStyles: Array.from({ length: 9 }, () => ({
          format: "text",
          direction: "context",
        })),
        validations: [
          {
            ref: "A2:A1001",
            type: "list",
            formula: '"چهارگزینه‌ای,صحیح / غلط,جای‌خالی,تشریحی"',
            title: "نوع سؤال",
            prompt: "نوع سؤال را از فهرست انتخاب کنید.",
          },
          {
            ref: "B2:B1001",
            title: "متن سؤال ـ الزامی",
            prompt: "هر ردیف یک سؤال؛ برای خط جدید داخل سلول Alt+Enter بزنید.",
          },
          {
            ref: "C2:F1001",
            title: "فقط برای چهارگزینه‌ای",
            prompt:
              "برای سؤال چهارگزینه‌ای هر چهار گزینه را بنویسید؛ برای بقیه انواع خالی بگذارید.",
          },
          {
            ref: "G2:G1001",
            title: "پاسخ صحیح ـ الزامی",
            prompt:
              "چهارگزینه‌ای: شماره ۱ تا ۴؛ صحیح / غلط: صحیح یا غلط؛ بقیه: پاسخ متنی.",
          },
          {
            ref: "H2:H1001",
            title: "بارم ـ الزامی",
            prompt:
              "عددی بین ۰٫۰۱ و ۱۰۰ با حداکثر دو رقم اعشار؛ مانند 0.5 یا 2.",
          },
          {
            ref: "I2:I1001",
            title: "توضیح پاسخ ـ اختیاری",
            prompt:
              "راهنمای تصحیح یا توضیح تکمیلی؛ این ستون را می‌توانید خالی بگذارید.",
          },
        ],
      },
      {
        name: "نمونه‌ها",
        rows: [headers, ...examples],
        widths: [23, 60, 25, 25, 25, 25, 44, 12, 48],
        columnStyles: Array.from({ length: 9 }, () => ({
          format: "text",
          direction: "context",
        })),
      },
      {
        name: "راهنما",
        rows: [
          ["ورود گروهی سؤال‌ها ـ نسخه ۱", "راهنما"],
          [
            "مقصد",
            "قبل از ورود، درس و فصل یا پودمان را در برنامه انتخاب کنید؛ تمام ردیف‌ها به همان بخش افزوده می‌شوند.",
          ],
          [
            "برگهٔ ورود",
            "فقط برگهٔ «سؤال‌ها» خوانده می‌شود. نام برگه و عنوان یا ترتیب ستون‌ها را تغییر ندهید.",
          ],
          [
            "نمونه‌ها",
            "برگهٔ نمونه‌ها ثبت نمی‌شود؛ در صورت نیاز ردیف‌های آن را به برگهٔ سؤال‌ها کپی کنید.",
          ],
          [
            "نوع سؤال",
            "در ستون نوع سؤال روی سلول کلیک و از فلش فهرست انتخاب کنید: چهارگزینه‌ای، صحیح / غلط، جای‌خالی یا تشریحی.",
          ],
          [
            "تکمیل جدول",
            "از ردیف ۲ شروع کنید؛ هر سؤال در یک ردیف. ردیف‌های خالی نادیده گرفته می‌شوند. با انتخاب هر سلول راهنمای همان ستون نمایش داده می‌شود. برای خط جدید داخل سلول Alt+Enter بزنید.",
          ],
          [
            "پاسخ چهارگزینه‌ای",
            "شمارهٔ گزینهٔ صحیح از ۱ تا ۴؛ چهار گزینهٔ متفاوت الزامی است.",
          ],
          ["پاسخ صحیح / غلط", "صحیح یا غلط؛ true و false نیز پذیرفته می‌شوند."],
          [
            "پاسخ جای‌خالی و تشریحی",
            "پاسخ متنی الزامی است؛ گزینه‌ها را خالی بگذارید.",
          ],
          [
            "بارم",
            "بین ۰٫۰۱ و ۱۰۰، حداکثر دو رقم اعشار؛ رقم فارسی و انگلیسی پذیرفته می‌شود.",
          ],
          [
            "محدودیت",
            "حداکثر ۱۰۰۰ سؤال و ۵ مگابایت؛ فایل XLSX بدون فرمول، سلول ادغام‌شده یا رمزگذاری.",
          ],
          [
            "ثبت",
            "ابتدا پیش‌نمایش را بررسی کنید. وجود خطا مانع ثبت کل فایل است؛ هیچ سؤال قبلی تغییر نمی‌کند.",
          ],
          [
            "تکراری",
            "فقط سؤال کاملاً یکسان در همان بخش تکراری است: نوع، متن، گزینه‌ها، پاسخ، بارم و توضیح. حروف بزرگ و کوچک و فاصله‌های داخل کد حفظ می‌شوند؛ تکراری‌ها ثبت نمی‌شوند.",
          ],
          [
            "متن فنی و کد",
            "سلول‌های ورود از نوع متن هستند تا 001، 1/2، 1e3 و متن آغازشده با = تغییر نکنند. قالب متن سلول‌ها را حفظ کنید؛ فرمول قابل ورود نیست. کد چندخطی و تورفتگی آن حفظ می‌شود.",
          ],
          [
            "متن",
            "حداکثر ۱۰۰۰۰ نویسه برای متن، پاسخ و توضیح و ۲۰۰۰ نویسه برای هر گزینه.",
          ],
        ],
      },
    ];
  }
  // Search normalization is intentionally not an identity rule: case, spacing,
  // Unicode symbols and line breaks can change the meaning of source code.
  const contentKey = (value) => String(value ?? "").replace(/\r\n?/g, "\n");
  function key(q) {
    return JSON.stringify([
      q.type,
      contentKey(q.text),
      q.options?.map(contentKey) || null,
      typeof q.answer === "string" ? contentKey(q.answer) : q.answer,
      q.score,
      contentKey(q.explanation),
    ]);
  }
  function preview(rows, bank, unitId) {
    if (!bank.units.some((u) => u.id === unitId))
      fail("فصل یا پودمان مقصد معتبر نیست.");
    if (
      !rows.length ||
      rows[0].error ||
      headers.some(
        (h, i) => D.searchText(rows[0].cells[i] || "") !== D.searchText(h),
      ) ||
      rows[0].cells.length > headers.length
    )
      fail(
        "ستون‌های فایل مطابق الگو نیستند؛ الگوی اکسل را دوباره دریافت کنید.",
      );
    const input = rows
      .slice(1)
      .filter(
        (row) => row.error || row.cells.some((value) => String(value).trim()),
      );
    if (!input.length)
      fail("برگهٔ سؤال‌ها خالی است؛ سؤال‌ها را در همین برگه وارد کنید.");
    if (input.length > MAX_ROWS) fail("در هر فایل حداکثر ۱۰۰۰ سؤال وارد کنید.");
    const seen = new Set(
      bank.questions.filter((q) => q.unitId === unitId).map(key),
    );
    const aliases = new Map(
      Object.entries(D.types).flatMap(([type, label]) => [
        [D.searchText(label).replaceAll(" ", ""), type],
        [type, type],
      ]),
    );
    aliases.set("صحیح‌وغلط".replaceAll("‌", ""), "boolean");
    aliases.set("صحیحغلط", "boolean");
    const results = input.map((row) => {
      let question;
      try {
        if (row.error) fail(row.error);
        if (row.cells.length > headers.length)
          fail("ستون اضافه خارج از الگو وجود دارد.");
        const cells = Array.from({ length: 9 }, (_, i) =>
          String(row.cells[i] ?? ""),
        );
        const [kind, text, ...rest] = cells;
        const options = rest.slice(0, 4),
          answer = cells[6];
        if (
          cells.some(
            (value, i) => value.length > (i >= 2 && i <= 5 ? 2000 : 10000),
          )
        )
          fail("طول متن از سقف مجاز الگو بیشتر است.");
        const type = aliases.get(D.searchText(kind).replaceAll(" ", ""));
        if (!type)
          fail("نوع سؤال ناشناخته است؛ یکی از چهار نوع راهنما را بنویسید.");
        question = {
          id: "preview-" + row.number,
          unitId,
          type,
          text,
          answer,
          score: D.score(cells[7]),
          explanation: cells[8],
        };
        if (type === "mcq") {
          if (!/^[1-4]$/.test(D.digits(answer)))
            fail("پاسخ چهارگزینه‌ای باید شماره‌ای از ۱ تا ۴ باشد.");
          question.answer = Number(D.digits(answer)) - 1;
          question.options = options;
          if (new Set(options.map(D.optionKey)).size !== 4)
            fail("چهار گزینه باید متفاوت باشند.");
        } else {
          if (options.some((option) => option.trim()))
            fail("گزینه‌ها فقط برای سؤال چهارگزینه‌ای مجازند.");
          if (type === "boolean") {
            const value = D.searchText(answer);
            if (!["صحیح", "غلط", "true", "false"].includes(value))
              fail("پاسخ صحیح / غلط باید «صحیح» یا «غلط» باشد.");
            question.answer = value === "صحیح" || value === "true";
          }
        }
        D.question(question);
        const identity = key(question);
        if (seen.has(identity))
          return {
            number: row.number,
            text,
            status: "duplicate",
            message:
              "محتوای کامل سؤال در این فایل یا همین بخش بانک یکسان است؛ ثبت نمی‌شود.",
          };
        seen.add(identity);
        return { number: row.number, text, status: "ready", question };
      } catch (error) {
        return {
          number: row.number,
          text: String(row.cells[1] || ""),
          status: "error",
          message: error.message,
        };
      }
    });
    return {
      revision: bank.revision,
      unitId,
      results,
      ready: results.filter((r) => r.status === "ready").length,
      errors: results.filter((r) => r.status === "error").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
    };
  }
  function prepare(report, bank) {
    if (report.revision !== bank.revision)
      fail("بانک سؤال تغییر کرده است؛ فایل را دوباره بررسی کنید.");
    if (report.errors || !report.ready)
      fail("فایل سؤال آمادهٔ ثبت ندارد یا دارای خطاست.");
    if (!bank.units.some((u) => u.id === report.unitId))
      fail("بخش مقصد حذف شده است.");
    const next = structuredClone(bank);
    for (const row of report.results.filter((r) => r.status === "ready"))
      next.questions.push({
        ...structuredClone(row.question),
        id: root.crypto.randomUUID(),
      });
    D.validate(next);
    D.size(next);
    return next;
  }
  function xml(bytes) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail("ساختار XML فایل مجاز نیست.");
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length)
      fail("ساختار اکسل خراب است.");
    return doc;
  }
  const nodes = (node, name) => [...node.getElementsByTagNameNS("*", name)];
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let bit = 0; bit < 8; bit++)
      n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  async function readXlsx(file) {
    if (!/\.xlsx$/i.test(file.name) || file.size > MAX_FILE || !file.size)
      fail("یک فایل XLSX معتبر با حجم حداکثر ۵ مگابایت انتخاب کنید.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer),
      u16 = (n) => view.getUint16(n, true),
      u32 = (n) => view.getUint32(n, true);
    const ensure = (offset, length) => {
      if (offset < 0 || length < 0 || offset + length > bytes.length)
        fail("فایل اکسل ناقص یا خراب است.");
    };
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
      if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) {
        end = i;
        break;
      }
    if (end < 0) fail("فایل، اکسل XLSX معتبر نیست.");
    if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10))
      fail("فایل اکسل چندبخشی پشتیبانی نمی‌شود.");
    const count = u16(end + 10),
      offset = u32(end + 16),
      length = u32(end + 12);
    if (count > 100 || count < 1) fail("تعداد اجزای اکسل بیش از حد مجاز است.");
    ensure(offset, length);
    let cursor = offset,
      expanded = 0;
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      ensure(cursor, 46);
      if (u32(cursor) !== 0x02014b50) fail("ساختار ZIP اکسل معتبر نیست.");
      const flags = u16(cursor + 8),
        method = u16(cursor + 10),
        size = u32(cursor + 24),
        packed = u32(cursor + 20),
        nameLength = u16(cursor + 28),
        local = u32(cursor + 42);
      ensure(cursor + 46, nameLength + u16(cursor + 30) + u16(cursor + 32));
      const name = new TextDecoder().decode(
        bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      );
      expanded += size;
      if (
        flags & 1 ||
        ![0, 8].includes(method) ||
        expanded > MAX_EXPANDED ||
        name.includes("..") ||
        name.startsWith("/") ||
        name.includes("\\") ||
        entries.has(name)
      )
        fail("فایل رمزگذاری‌شده، تکراری یا بیش از حد بزرگ است.");
      entries.set(name, {
        flags,
        method,
        size,
        packed,
        local,
        crc: u32(cursor + 16),
      });
      cursor += 46 + nameLength + u16(cursor + 30) + u16(cursor + 32);
    }
    if (cursor !== offset + length) fail("فهرست اجزای اکسل معتبر نیست.");
    async function part(name, optional = false) {
      const item = entries.get(name);
      if (!item) {
        if (optional) return null;
        fail("برگه یا اطلاعات لازم در اکسل پیدا نشد.");
      }
      ensure(item.local, 30);
      if (
        u32(item.local) !== 0x04034b50 ||
        u16(item.local + 8) !== item.method ||
        u16(item.local + 6) & 1
      )
        fail("ساختار داخلی اکسل معتبر نیست.");
      const start =
        item.local + 30 + u16(item.local + 26) + u16(item.local + 28);
      ensure(start, item.packed);
      let data = bytes.subarray(start, start + item.packed);
      if (item.method === 8) {
        if (!root.DecompressionStream)
          fail(
            "مرورگر شما خواندن این اکسل را پشتیبانی نمی‌کند؛ مرورگر را به‌روز کنید.",
          );
        const reader = new Blob([data])
          .stream()
          .pipeThrough(new DecompressionStream("deflate-raw"))
          .getReader();
        const chunks = [];
        let total = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > item.size || total > MAX_EXPANDED)
              fail("حجم بازشدهٔ اکسل بیش از حد مجاز است.");
            chunks.push(value);
          }
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        }
        data = new Uint8Array(total);
        let index = 0;
        for (const chunk of chunks) {
          data.set(chunk, index);
          index += chunk.length;
        }
      }
      let crc = 0xffffffff;
      for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      if (data.length !== item.size || (crc ^ 0xffffffff) >>> 0 !== item.crc)
        fail("داده‌های اکسل ناقص یا خراب‌اند.");
      return xml(data);
    }
    const book = await part("xl/workbook.xml"),
      rels = await part("xl/_rels/workbook.xml.rels");
    const sheets = nodes(book, "sheet").filter(
      (s) => s.getAttribute("name") === sheetName,
    );
    if (sheets.length !== 1)
      fail("برگهٔ «سؤال‌ها» پیدا نشد؛ از الگوی برنامه استفاده کنید.");
    const id = sheets[0].getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "id",
    );
    const rel = nodes(rels, "Relationship").find(
      (r) => r.getAttribute("Id") === id,
    );
    const target = rel?.getAttribute("Target") || "";
    if (
      rel?.getAttribute("TargetMode") === "External" ||
      !/^(?:\/xl\/|)(?:worksheets\/)sheet[\w-]*\.xml$/.test(target)
    )
      fail("نشانی برگهٔ سؤال‌ها معتبر نیست.");
    const sheet = await part(
      target.startsWith("/xl/") ? target.slice(1) : "xl/" + target,
    );
    if (nodes(sheet, "mergeCell").length)
      fail("سلول‌های برگهٔ سؤال‌ها نباید ادغام شده باشند.");
    const shared = await part("xl/sharedStrings.xml", true);
    const strings = shared
      ? nodes(shared, "si").map((si) =>
          nodes(si, "t")
            .map((t) => t.textContent)
            .join(""),
        )
      : [];
    const rows = nodes(sheet, "row");
    if (rows.length > MAX_ROWS + 100)
      fail(
        "تعداد ردیف‌های فایل بیش از حد مجاز است؛ ردیف‌های خالی اضافه را حذف کنید.",
      );
    const seenRows = new Set();
    return rows.map((row, index) => {
      const number = Number(row.getAttribute("r"));
      if (
        !Number.isInteger(number) ||
        number < 1 ||
        seenRows.has(number) ||
        (index === 0 && number !== 1)
      )
        fail("شمارهٔ ردیف‌های اکسل معتبر نیست.");
      seenRows.add(number);
      const cells = [],
        used = new Set();
      let error = "";
      for (const cell of nodes(row, "c")) {
        const reference = /^([A-Z]+)(\d+)$/.exec(cell.getAttribute("r") || "");
        if (!reference || Number(reference[2]) !== number)
          fail("نشانی سلول اکسل معتبر نیست.");
        let column = 0;
        for (const letter of reference[1])
          column = column * 26 + letter.charCodeAt(0) - 64;
        column--;
        if (column > 50 || used.has(column))
          fail("ستون اضافه یا تکراری در فایل وجود دارد.");
        used.add(column);
        if (nodes(cell, "f").length)
          error = "فرمول مجاز نیست؛ مقدار سلول را به متن یا عدد تبدیل کنید.";
        const type = cell.getAttribute("t"),
          raw = nodes(cell, "v")[0]?.textContent || "";
        if (type === "e") error = "سلول اکسل دارای خطاست.";
        let value =
          type === "inlineStr"
            ? nodes(cell, "t")
                .map((t) => t.textContent)
                .join("")
            : raw;
        if (type === "s") {
          if (!/^\d+$/.test(raw) || Number(raw) >= strings.length)
            fail("جدول متن‌های اکسل معتبر نیست.");
          value = strings[Number(raw)];
        }
        if (type === "b") value = raw === "1" ? "true" : "false";
        if (column >= 9 && !value && !nodes(cell, "f").length) continue;
        cells[column] = value.replace(/_x([0-9a-f]{4})_/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
      }
      return { number, cells, error };
    });
  }
  root.EduQuestionBankImport = {
    headers,
    templateSheets,
    examples,
    preview,
    prepare,
    readXlsx,
    MAX_ROWS,
    MAX_FILE,
  };
})(globalThis);
