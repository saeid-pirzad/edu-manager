(function (root) {
  "use strict";
  const LIMIT = 20 * 1024 * 1024;
  const types = {
    mcq: "چهارگزینه‌ای",
    blank: "جای‌خالی",
    essay: "تشریحی",
    boolean: "صحیح / غلط",
  };
  const fail = (message) => {
    throw Error(message);
  };
  const text = (value) => typeof value === "string" && value.trim().length > 0;
  function fields(value, allowed) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key))
    )
      fail("فیلد ناشناخته در فایل بانک سؤال وجود دارد.");
  }
  function digits(value) {
    return String(value)
      .trim()
      .replace(/[۰-۹٠-٩]/g, (c) =>
        String(
          "۰۱۲۳۴۵۶۷۸۹".includes(c)
            ? "۰۱۲۳۴۵۶۷۸۹".indexOf(c)
            : "٠١٢٣٤٥٦٧٨٩".indexOf(c),
        ),
      )
      .replace(/٫/g, ".");
  }
  function score(value) {
    const s = digits(value);
    if (!/^\d+(\.\d{1,2})?$/.test(s))
      fail("بارم باید عددی با حداکثر دو رقم اعشار باشد.");
    const [whole, fraction = ""] = s.split(".");
    const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(n) || n < 1 || n > 10000)
      fail("بارم باید بین ۰٫۰۱ و ۱۰۰ باشد.");
    return n;
  }
  function searchText(value) {
    return digits(value)
      .normalize("NFKC")
      .replace(/[يى]/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[\s\u200c\u200d]+/g, " ")
      .trim()
      .toLocaleLowerCase("fa-IR");
  }
  function optionKey(value) {
    return String(value)
      .normalize("NFKC")
      .replace(/[يى]/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[\s\u200c\u200d]+/g, " ")
      .trim();
  }
  function integer(value, min, max) {
    const s = digits(value),
      n = Number(s);
    if (!/^\d+$/.test(s) || !Number.isSafeInteger(n) || n < min || n > max)
      fail(`عدد صحیح بین ${min} و ${max} وارد کنید.`);
    return n;
  }
  function empty() {
    return {
      format: "classyar-question-bank",
      version: 1,
      revision: 0,
      courses: [],
      units: [],
      questions: [],
      exams: [],
    };
  }
  function question(q) {
    fields(q, [
      "id",
      "unitId",
      "type",
      "text",
      "answer",
      "explanation",
      "score",
      "options",
      "unitTitle",
    ]);
    if (
      !q ||
      !text(q.id) ||
      !text(q.unitId) ||
      typeof q.type !== "string" ||
      !Object.hasOwn(types, q.type) ||
      !text(q.text) ||
      typeof q.explanation !== "string" ||
      !Number.isInteger(q.score) ||
      q.score < 1 ||
      q.score > 10000
    )
      fail("سؤال یا بارم نامعتبر است.");
    if (q.type === "mcq") {
      if (
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        !q.options.every(text) ||
        new Set(q.options.map((x) => x.trim())).size !== 4 ||
        !Number.isInteger(q.answer) ||
        q.answer < 0 ||
        q.answer > 3
      )
        fail("چهار گزینه متفاوت و پاسخ معتبر لازم است.");
    } else {
      if (Object.hasOwn(q, "options"))
        fail("گزینه اضافی برای این نوع سؤال مجاز نیست.");
      if (
        q.type === "boolean" ? typeof q.answer !== "boolean" : !text(q.answer)
      )
        fail("پاسخ سؤال معتبر نیست.");
    }
  }
  function size(bank) {
    const json = JSON.stringify(bank);
    if (new TextEncoder().encode(json).length > LIMIT)
      fail("سقف حجم بانک ۲۰ مگابایت است.");
    return json;
  }
  function validDate(value) {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    );
  }
  function validate(bank) {
    if (
      !bank ||
      bank.format !== "classyar-question-bank" ||
      bank.version !== 1 ||
      !Number.isSafeInteger(bank.revision) ||
      bank.revision < 0 ||
      Object.keys(bank).sort().join() !==
        [
          "format",
          "version",
          "revision",
          "courses",
          "units",
          "questions",
          "exams",
        ]
          .sort()
          .join()
    )
      fail("قالب یا نسخه فایل بانک سؤال معتبر نیست.");
    const allIds = new Set();
    for (const key of ["courses", "units", "questions", "exams"]) {
      if (!Array.isArray(bank[key])) fail("ساختار بانک نامعتبر است.");
      for (const item of bank[key]) {
        if (!item || !text(item.id) || allIds.has(item.id))
          fail("شناسه خالی یا تکراری است.");
        allIds.add(item.id);
      }
    }
    const uniqueTitles = (items, scope) => {
      const titles = new Set();
      for (const item of items) {
        const key = JSON.stringify([scope(item), String(item.title).trim()]);
        if (!text(item.title) || titles.has(key))
          fail("عنوان خالی یا تکراری است.");
        titles.add(key);
      }
    };
    uniqueTitles(bank.courses, () => "");
    uniqueTitles(bank.units, (u) => u.courseId);
    for (const c of bank.courses) fields(c, ["id", "title", "structure"]);
    for (const u of bank.units) fields(u, ["id", "courseId", "title"]);
    for (const c of bank.courses)
      if (!["chapter", "module"].includes(c.structure))
        fail("ساختار درس نامعتبر است.");
    const courseIds = new Set(bank.courses.map((c) => c.id));
    const unitIds = new Set(bank.units.map((u) => u.id));
    for (const u of bank.units)
      if (!courseIds.has(u.courseId)) fail("ارتباط بخش با درس نامعتبر است.");
    for (const q of bank.questions) {
      question(q);
      if (!unitIds.has(q.unitId)) fail("بخش سؤال معتبر نیست.");
    }
    for (const e of bank.exams) {
      fields(e, [
        "id",
        "title",
        "courseTitle",
        "school",
        "teacher",
        "date",
        "duration",
        "questions",
      ]);
      if (
        !text(e.title) ||
        !text(e.courseTitle) ||
        typeof e.school !== "string" ||
        typeof e.teacher !== "string" ||
        !validDate(e.date) ||
        !Number.isInteger(e.duration) ||
        e.duration < 1 ||
        e.duration > 600 ||
        !Array.isArray(e.questions) ||
        !e.questions.length ||
        e.questions.length > 500
      )
        fail("آزمون خالی یا نامعتبر است.");
      const ids = new Set();
      for (const q of e.questions) {
        question(q);
        if (!text(q.unitTitle) || ids.has(q.id))
          fail("سؤال تکراری یا بخش نامعتبر در آزمون.");
        ids.add(q.id);
      }
    }
    size(bank);
    return bank;
  }
  function parse(json) {
    if (new TextEncoder().encode(json).length > LIMIT)
      fail("سقف فایل ورودی ۲۰ مگابایت است.");
    return validate(JSON.parse(json.replace(/^\uFEFF/, "")));
  }
  function shuffle(list, random = Math.random) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function generate(bank, spec, random = Math.random) {
    if (!spec || typeof spec !== "object" || Array.isArray(spec))
      fail("مشخصات طرح آزمون معتبر نیست.");
    if (
      !text(spec.courseId) ||
      !Array.isArray(spec.unitIds) ||
      !spec.unitIds.length ||
      !spec.unitIds.every(text) ||
      new Set(spec.unitIds).size !== spec.unitIds.length
    )
      fail("درس و بخش‌های معتبر و غیرتکراری انتخاب کنید.");
    if (
      !spec.counts ||
      typeof spec.counts !== "object" ||
      Array.isArray(spec.counts)
    )
      fail("تعداد سؤال‌های هر نوع را مشخص کنید.");
    if (
      !text(spec.title) ||
      typeof spec.school !== "string" ||
      typeof spec.teacher !== "string" ||
      !validDate(spec.date)
    )
      fail("مشخصات آزمون معتبر نیست.");
    const duration = integer(spec.duration, 1, 600);
    const course = bank.courses.find((c) => c.id === spec.courseId);
    const units = new Map(bank.units.map((u) => [u.id, u]));
    const unitIds = new Set(spec.unitIds);
    if (
      !course ||
      spec.unitIds.some((id) => units.get(id)?.courseId !== spec.courseId)
    )
      fail("درس و بخش‌های معتبر انتخاب کنید.");
    const counts = Object.fromEntries(
      Object.keys(types).map((type) => [
        type,
        integer(spec.counts[type], 0, 500),
      ]),
    );
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (!total || total > 500) fail("آزمون باید بین ۱ و ۵۰۰ سؤال داشته باشد.");
    const pools = Object.fromEntries(
      Object.keys(types).map((type) => [type, []]),
    );
    for (const q of bank.questions)
      if (unitIds.has(q.unitId) && Object.hasOwn(pools, q.type))
        pools[q.type].push(q);
    const selected = [];
    for (const type of Object.keys(types)) {
      const count = counts[type],
        pool = pools[type];
      if (count > pool.length)
        fail(
          `${types[type]}: ${pool.length} سؤال موجود است؛ تعداد درخواستی ${count} است.`,
        );
      selected.push(...shuffle(pool, random).slice(0, count));
    }
    const exam = {
      id: crypto.randomUUID(),
      title: spec.title.trim(),
      courseTitle: course.title,
      school: spec.school.trim(),
      teacher: spec.teacher.trim(),
      date: spec.date,
      duration,
      questions: shuffle(selected, random).map((q) => ({
        ...structuredClone(q),
        unitTitle: units.get(q.unitId).title,
      })),
    };
    validate({ ...bank, exams: [...bank.exams, exam] });
    return exam;
  }
  root.EduQuestionBank = {
    LIMIT,
    types,
    digits,
    searchText,
    optionKey,
    score,
    integer,
    empty,
    validate,
    question,
    parse,
    size,
    generate,
  };
})(globalThis);
