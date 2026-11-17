"use strict";
const { createDemoBank } = require("./question-bank-demo.cjs");
function createReviewBank(D) {
  const bank = createDemoBank(D);
  bank.courses.push({
    id: "review-edge",
    title: "آزمایش حالت‌های مرزی — نمونه آموزشی",
    structure: "chapter",
  });
  bank.units.push({
    id: "review-unit",
    courseId: "review-edge",
    title: "متن، گزینه و بارم",
  });
  const base = {
    unitId: "review-unit",
    explanation: "نمونهٔ بازبینی نرم‌افزار؛ آزمون رسمی نیست.",
    score: 125,
  };
  for (let index = 0; index < 4; index++)
    bank.questions.push({
      ...base,
      id: "review-choice-" + index,
      type: "mcq",
      text: `کدام گزینه برابر ${index + 1} است؟ (بازبینی پاسخ صحیح در جایگاه ${index + 1})`,
      options: ["۱", "۲", "۳", "۴"],
      answer: index,
    });
  bank.questions.push(
    {
      ...base,
      id: "review-true",
      type: "boolean",
      text: "یک صدم نمره برابر ۰٫۰۱ نمره است.",
      answer: true,
      score: 1,
    },
    {
      ...base,
      id: "review-false",
      type: "boolean",
      text: "عدد ۱۰۰ کوچک‌تر از عدد ۱ است.",
      answer: false,
      score: 10000,
    },
    {
      ...base,
      id: "review-blank",
      type: "blank",
      text: "حاصل جمع ۰٫۲۵ و ۰٫۷۵ را بنویسید.\nاین سؤال عمداً جای‌خالی در متن ندارد تا خط پاسخ چاپی بررسی شود.",
      answer: "۱",
      score: 25,
    },
    {
      ...base,
      id: "review-long",
      type: "essay",
      text:
        "نمایش متن چندخطی و ترکیبی را بررسی کنید:\nمسیر فایل: C:/Lessons/Exam-01.txt\nعبارت نمونه: <script>alert('example')</script> باید فقط متن دیده شود.\n" +
        "برای طراحی آزمون، وضوح صورت سؤال و تناسب زمان پاسخ‌گویی را توضیح دهید. ".repeat(
          12,
        ),
      answer:
        "متن باید بدون اجرای کد و با حفظ خطوط نمایش داده شود؛ در چاپ محل پاسخ لازم است.",
      score: 250,
    },
  );
  const exam = D.generate(
    bank,
    {
      courseId: "review-edge",
      unitIds: ["review-unit"],
      counts: { mcq: 4, blank: 1, essay: 1, boolean: 2 },
      title: "بازبینی حالت‌های مرزی — بارم آموزشی نامتعارف",
      school: "محیط بازبینی",
      teacher: "دبیر نمونه",
      date: "2026-11-17",
      duration: 600,
    },
    () => 0.4,
  );
  exam.id = "review-exam";
  bank.exams.push(exam);
  return D.validate(bank);
}
module.exports = { createReviewBank };
