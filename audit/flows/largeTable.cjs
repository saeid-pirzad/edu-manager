"use strict";
module.exports = async function largeTable() {
  const cases = [];
  closeModal();
  await EduV24.test.settle();
  const original = db.schools[0].classes[0];
  const originalCount = original.students.length;
  const base = original.lessons.find(
    (item) => item.gradingPolicy?.method === "modular",
  );
  const lesson = { ...base, poudmans: [base.poudmans[0]] };
  try {
    for (const size of [100, 500, 1000]) {
      const classroom = {
        ...original,
        students: Array.from({ length: size }, (_, index) => ({
          id: "performance_" + index,
          name: "هنرجوی آزمایشی " + index,
          code: String(index),
        })),
      };
      const start = performance.now();
      const html = EduV24.course.table(classroom, lesson, null, true);
      const htmlMs = performance.now() - start;
      const mountStart = performance.now();
      showModal("Large synthetic table", html);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const body = document.getElementById("modalBody");
      const inputs = body.querySelectorAll('input[data-grade="1"]').length;
      cases.push({
        id: "PERF-" + size,
        name:
          "synthetic modular grade table renders " +
          size +
          " students without changing stored data",
        pass: inputs === size * 2 && original.students.length === originalCount,
        observed: {
          students: size,
          gradeInputs: inputs,
          htmlMs: Math.round(htmlMs),
          mountAndEnhanceMs: Math.round(performance.now() - mountStart),
        },
      });
      closeModal();
    }
  } finally {
    closeModal();
    goSchools();
  }
  return cases;
};
