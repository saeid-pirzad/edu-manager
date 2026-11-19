(function (root) {
  "use strict";

  // Original practice material, not an official curriculum or standardized exam.
  function createNetworkGrade11Bank(D) {
    const bank = D.empty();
    bank.courses = [
      {
        id: "net11-web",
        title: "طراحی وب و برنامه‌نویسی — یازدهم — آزمایشی",
        structure: "module",
      },
      {
        id: "net11-data",
        title: "داده، رایانه و شبکه — یازدهم — آزمایشی",
        structure: "chapter",
      },
    ];
    bank.units = bank.courses.flatMap((c) => [
      {
        id: c.id + "-1",
        courseId: c.id,
        title:
          (c.structure === "module" ? "پودمان" : "فصل") +
          " ۱ — مفاهیم و خواندن کد",
      },
      {
        id: c.id + "-2",
        courseId: c.id,
        title:
          (c.structure === "module" ? "پودمان" : "فصل") +
          " ۲ — تحلیل و حل مسئله",
      },
    ]);
    const records = [
      [
        "mcq",
        "برای ایجاد پیوند به صفحهٔ دیگری در HTML از کدام عنصر استفاده می‌کنیم؟",
        ["a", "p", "h1", "br"],
        0,
        "عنصر a همراه ویژگی href برای پیوند استفاده می‌شود.",
      ],
      [
        "mcq",
        "Which CSS property changes the text color?",
        ["color", "width", "display", "margin"],
        0,
        "The color property sets the foreground text color.",
      ],
      [
        "mcq",
        "در فرم ثبت‌نام، چرا اعتبارسنجی سمت سرور نیز لازم است؟",
        [
          "چون درخواست می‌تواند بدون اجرای اعتبارسنجی مرورگر مستقیماً به سرور ارسال شود و دادهٔ ورودی باید دوباره بررسی شود.",
          "چون اعتبارسنجی سرور جایگزین تمام کنترل‌های دسترسی و احراز هویت است.",
          "چون استفاده از HTML به‌تنهایی مانع ارسال دادهٔ نامعتبر از هر ابزار دیگری می‌شود.",
          "چون اگر مرورگر پیام خطا نمایش دهد، دیگر هیچ داده‌ای به سرور نمی‌رسد و بررسی سرور همیشه اضافی است.",
        ],
        0,
        "اعتبارسنجی مرورگر برای تجربهٔ کاربر مفید است، اما مرز امنیتی قابل اتکا نیست.",
      ],
      [
        "boolean",
        "در CSS، انتخابگر .notice عناصر دارای class برابر notice را انتخاب می‌کند.",
        true,
        null,
        "نقطه پیش از نام، انتخابگر کلاس را مشخص می‌کند.",
      ],
      [
        "boolean",
        "HTML is a database management system.",
        false,
        null,
        "HTML describes document structure; it is not a database management system.",
      ],
      [
        "boolean",
        "اگر ورودی یک فرم در مرورگر بررسی شود، بررسی همان ورودی در Server دیگر لازم نیست.",
        false,
        null,
        "کنترل مرورگر قابل دور زدن است؛ سرور باید دادهٔ ورودی را بررسی کند.",
      ],
      [
        "blank",
        "برای تعیین مقصد پیوند در عنصر a از ویژگی ........ استفاده می‌کنیم.",
        "href",
        null,
        'نمونه: <a href="lesson.html">درس</a>',
      ],
      [
        "blank",
        "In CSS, the ........ property sets the space inside the border of an element.",
        "padding",
        null,
        "Padding is inside the border; margin is outside it.",
      ],
      [
        "blank",
        "در JavaScript، خروجی عبارت 2 + 3 * 4 برابر است با",
        "14",
        null,
        "ضرب پیش از جمع انجام می‌شود؛ 2 + 12 = 14.",
      ],
      [
        "essay",
        "کد زیر را بخوانید و مقدار نهایی total را همراه دلیل بنویسید:\nlet total = 0;\nfor (let i = 1; i <= 3; i++) { total += i; }",
        "مقدار نهایی 6 است؛ حلقه اعداد 1، 2 و 3 را جمع می‌کند.",
        null,
        "پاسخ باید تعداد تکرارها و نتیجهٔ جمع را توضیح دهد.",
      ],
      [
        "essay",
        "Explain the difference between HTML structure and CSS presentation. Give one short example for each.",
        "HTML defines elements such as headings and paragraphs; CSS controls presentation such as color and spacing. Example: <h1>Title</h1> and h1 { color: blue; }.",
        null,
        "Accept equivalent correct examples; assess the distinction, not memorized wording.",
      ],
      [
        "essay",
        "برای فرم ثبت نام هنرجو، یک طرح بررسی ورودی پیشنهاد کنید.\nالف) نام خالی چه پیامی داشته باشد؟\nب) ایمیل نامعتبر چگونه اعلام شود؟\nج) چرا خطا نباید فقط با رنگ مشخص شود؟\nد) نقش Client و Server را جدا توضیح دهید.",
        "نام و ایمیل باید با پیام روشن کنار فیلد بررسی شوند؛ پیام متنی و ارتباط دسترس‌پذیر با فیلد لازم است. کنترل سمت کاربر برای بازخورد سریع و سمت سرور برای اعتبارسنجی قابل اتکا انجام می‌شود.",
        null,
        "برای هر یک از چهار بخش پاسخ مستقل ارزیابی شود.",
      ],
      [
        "mcq",
        "کدام گزینه برای شناسایی یکتای هر رکورد در یک جدول رابطه‌ای مناسب است؟",
        ["کلید اصلی", "رنگ سطر", "ترتیب نمایش سطر", "عنوان گزارش"],
        0,
        "کلید اصلی هر رکورد را به‌صورت یکتا مشخص می‌کند.",
      ],
      [
        "mcq",
        "Which device forwards IP packets between different networks?",
        ["Router", "Keyboard", "Monitor", "Scanner"],
        0,
        "A router forwards packets between networks.",
      ],
      [
        "mcq",
        "برای جدول هنرجویان، کدام طراحی مناسب‌تر است؟",
        [
          "یک شناسهٔ یکتا برای هر هنرجو تعریف شود و نام کامل در فیلدی جدا ذخیره شود تا افراد هم‌نام قابل تشخیص باشند.",
          "نام کامل به‌تنهایی کلید اصلی باشد، چون دو هنرجو هیچ‌گاه نام یکسان ندارند.",
          "شمارهٔ سطرِ نمایش‌داده‌شده در گزارش، بدون ذخیرهٔ شناسهٔ پایدار، تنها هویت هنرجو باشد.",
          "تمام اطلاعات همهٔ هنرجویان در یک خانهٔ متنی نوشته شود تا جست‌وجو و اصلاح رکوردها لازم نباشد.",
        ],
        0,
        "هویت پایدار نباید به نام یا ترتیب نمایش وابسته باشد.",
      ],
      [
        "boolean",
        "داشتن نسخهٔ پشتیبان روی همان دیسک، به‌تنهایی در برابر خرابی کامل همان دیسک کافی است.",
        false,
        null,
        "خرابی دیسک می‌تواند دادهٔ اصلی و پشتیبان روی همان دیسک را هم‌زمان از بین ببرد.",
      ],
      [
        "boolean",
        "A primary key uniquely identifies a row in a relational table.",
        true,
        null,
        "Primary key values uniquely identify rows.",
      ],
      [
        "boolean",
        "در جدول هنرجویان، ستون student_id می‌تواند برای تفکیک دو هنرجوی هم‌نام استفاده شود.",
        true,
        null,
        "شناسه باید یکتا باشد؛ نام افراد الزاماً یکتا نیست.",
      ],
      [
        "blank",
        "در SQL، برای خواندن رکوردها از جدول از دستور ........ استفاده می‌شود.",
        "SELECT",
        null,
        "SELECT برای بازیابی داده کاربرد دارد.",
      ],
      [
        "blank",
        "The device that forwards packets between networks is called a ........ .",
        "router",
        null,
        "Accept router, regardless of capitalization.",
      ],
      [
        "blank",
        "برای محدودکردن رکوردهای خروجی SELECT بر اساس یک شرط از کدام بند استفاده می‌کنیم؟",
        "WHERE",
        null,
        "WHERE شرط انتخاب رکوردها را بیان می‌کند.",
      ],
      [
        "essay",
        "جدول Students دارای ستون‌های student_id، full_name و grade است. دستور SQL نمایش نام هنرجویان پایهٔ 11 را بنویسید؛ فرض کنید grade عددی است.",
        "SELECT full_name FROM Students WHERE grade = 11;",
        null,
        "تفاوت حروف بزرگ و کوچک کلیدواژه‌ها و فاصله‌های اضافی در ارزیابی نادیده گرفته شود.",
      ],
      [
        "essay",
        "Explain why a backup should be tested by restoring it in a separate environment. Do not overwrite the original data in your proposed test.",
        "A successful backup operation alone does not prove recoverability. Restore a copy into an isolated environment and verify records and integrity without modifying the source.",
        null,
        "Assess isolation, successful restore and data verification.",
      ],
      [
        "essay",
        "در کارگاه، دو هنرجو نام یکسان دارند و ارتباط شبکه هم گاهی قطع می‌شود.\n۱) برای جلوگیری از اشتباه در ثبت نمره چه شناسه‌ای پیشنهاد می‌کنید؟\n۲) هنگام قطع ارتباط، چرا نباید پیام «ذخیره شد» نمایش داده شود مگر ذخیره واقعاً تأیید شده باشد؟\n۳) یک روش امن برای بررسی بازیابی پشتیبان توضیح دهید.",
        "شناسهٔ یکتا و پایدار لازم است. پیام ذخیره باید مطابق نتیجهٔ واقعی باشد و خطا امکان تلاش مجدد بدهد. بازیابی ابتدا در محیط جدا و با کنترل صحت داده آزمایش شود.",
        null,
        "سه مؤلفهٔ هویت، صداقت وضعیت ذخیره و بازیابی ایمن مستقل ارزیابی شوند.",
      ],
    ];
    bank.questions = records.map(
      ([type, text, value, answer, explanation], index) => ({
        id: "net11-q-" + (index + 1),
        unitId:
          bank.courses[index < 12 ? 0 : 1].id + (index % 3 === 2 ? "-2" : "-1"),
        type,
        text,
        explanation,
        score: [100, 150, 250][index % 3],
        answer: type === "mcq" ? answer : value,
        ...(type === "mcq" ? { options: value } : {}),
      }),
    );
    for (const [index, question] of bank.questions.entries()) {
      if (question.type !== "mcq") continue;
      const correct = question.options.shift();
      question.answer = index === 2 ? 3 : index % 4;
      question.options.splice(question.answer, 0, correct);
    }
    // Deterministic sampling is only for reproducible fixtures, not production.
    let seed = 140511;
    const random = () =>
      (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (const course of bank.courses) {
      const spec = {
        courseId: course.id,
        unitIds: bank.units
          .filter((u) => u.courseId === course.id)
          .map((u) => u.id),
        title: "آزمون جامع ترکیبی — ۲۰ نمره — نمونهٔ تألیفی",
        school: "هنرستان نمونه — دادهٔ آزمایشی",
        teacher: "دبیر نمونه",
        date: "2026-11-19",
        duration: 60,
        counts: { mcq: 3, boolean: 3, blank: 3, essay: 3 },
        totalScore: "20",
      };
      bank.exams.push(D.generate(bank, spec, random));
      bank.exams.push(
        D.generate(
          bank,
          {
            ...spec,
            title: "آزمون کوتاه ترکیبی — انتخاب از بانک",
            duration: 30,
            counts: { mcq: 1, boolean: 1, blank: 1, essay: 1 },
            totalScore: undefined,
          },
          random,
        ),
      );
    }
    return D.validate(bank);
  }
  function addTo(bank) {
    const D = root.EduQuestionBank;
    D.validate(bank);
    const sample = createNetworkGrade11Bank(D);
    sample.exams.forEach((exam, index) => {
      exam.id = "net11-sample-exam-" + (index + 1);
    });
    const next = structuredClone(bank);
    const existing = new Set(
      ["courses", "units", "questions", "exams"].flatMap((key) =>
        bank[key].map((item) => item.id),
      ),
    );
    for (const key of ["courses", "units", "questions", "exams"]) {
      if (sample[key].some((item) => existing.has(item.id)))
        throw Error(
          "نمونهٔ یازدهم قبلاً اضافه شده یا بخشی از آن هنوز در بانک موجود است؛ اطلاعاتی تغییر نکرد.",
        );
      next[key].push(...sample[key]);
    }
    return D.validate(next);
  }
  root.EduQuestionBankSample = Object.freeze({
    createNetworkGrade11Bank,
    addTo,
  });
})(globalThis);
