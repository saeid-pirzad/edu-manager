"use strict";

async function seniorUiReview() {
  const results = [];
  document.getElementById("pwaWelcomeLater")?.click();
  closeModal();
  const originalName = db.schools[0].name,
    originalClass = db.schools[0].classes[0].name;
  db.schools[0].name = "مدرسه " + "طولانی".repeat(70);
  db.schools[0].classes[0].name = "کلاس " + "آزمایشی".repeat(50);
  const measure = (name) => {
    const bad = [];
    for (const control of document.querySelectorAll(
      "#app button,#app input,#app select,#app textarea,#app summary",
    )) {
      const rect = control.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.left >= -1 && rect.right <= innerWidth + 1) continue;
      let scrolled = false;
      for (
        let parent = control.parentElement;
        parent && parent.id !== "app";
        parent = parent.parentElement
      ) {
        if (
          ["auto", "scroll"].includes(getComputedStyle(parent).overflowX) &&
          parent.scrollWidth > parent.clientWidth
        ) {
          scrolled = true;
          break;
        }
      }
      if (!scrolled)
        bad.push({
          text: (
            control.getAttribute("aria-label") ||
            control.textContent ||
            control.name
          ).slice(0, 70),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        });
    }
    results.push({
      id: "U-" + name,
      name:
        "320px long names: interactive controls remain reachable in " + name,
      pass:
        document.documentElement.scrollWidth <= innerWidth + 1 && !bad.length,
      observed: {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        clipped: bad,
      },
    });
  };
  for (const [name, open] of [
    ["home", () => goSchools()],
    [
      "class",
      () => {
        goSchool("school_a");
        goClass("class_a");
      },
    ],
    ["lesson", () => goLesson("lesson_dual")],
    ["grades", () => setTab("grades")],
    ["reports", () => goReports()],
    ["annual", () => setReportTab("annual")],
  ]) {
    open();
    await new Promise((resolve) => setTimeout(resolve, 100));
    measure(name);
  }
  db.schools[0].name = originalName;
  db.schools[0].classes[0].name = originalClass;
  goSchools();
  return results;
}

module.exports = seniorUiReview;
