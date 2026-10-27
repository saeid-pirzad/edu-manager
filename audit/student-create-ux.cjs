"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
async function inspectStudentCreate() {
  goSchool(db.schools[0].id);
  goClass(db.schools[0].classes[0].id);
  setTab("students");
  const panel = document.querySelector(".student-add");
  const closed = !panel.open;
  panel.open = true;
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const form = panel.querySelector("form");
  const controls = [...form.querySelectorAll("input,button")];
  const name = form.querySelector("#studentCreateName").getBoundingClientRect();
  const code = form.querySelector("#studentCreateCode").getBoundingClientRect();
  return [
    {
      id: "STUDENT-UX-" + innerWidth + "-0",
      name: "student directory precedes create and import panels at every viewport",
      pass:
        panel.getBoundingClientRect().bottom <=
          document.querySelector(".student-import").getBoundingClientRect()
            .top +
            1 &&
        document.querySelector(".student-directory").getBoundingClientRect()
          .bottom <=
          panel.getBoundingClientRect().top + 1 &&
        !!(
          document
            .querySelector(".student-directory")
            .compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
    },
    {
      id: "STUDENT-UX-" + innerWidth + "-1",
      name: "student creation starts closed with a single clean heading",
      pass:
        closed &&
        !panel.querySelector("summary small") &&
        panel.querySelector("summary strong").textContent === "هنرجوی جدید",
    },
    {
      id: "STUDENT-UX-" + innerWidth + "-2",
      name: "student fields and submit fit with readable text and touch targets",
      pass:
        form.scrollWidth <= form.clientWidth + 1 &&
        controls.every((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.left >= 0 && rect.right <= innerWidth + 1 && rect.height >= 44
          );
        }) &&
        [...form.querySelectorAll("input")].every(
          (el) => parseFloat(getComputedStyle(el).fontSize) >= 16,
        ),
    },
    {
      id: "STUDENT-UX-" + innerWidth + "-3",
      name: "student name and code align on roomy layouts and retain one-line optional badge",
      pass:
        (panel.clientWidth < 562 || Math.abs(name.bottom - code.bottom) < 2) &&
        form.querySelector(".student-field-heading").scrollWidth <=
          form.querySelector(".student-field-heading").clientWidth + 1 &&
        getComputedStyle(form.querySelector(".student-field-optional"))
          .color === "rgb(154, 103, 0)",
    },
  ];
}
module.exports = async function studentCreateUx({
  cdp,
  evaluate,
  cases,
  delay,
}) {
  const previews = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-student-create-"),
  );
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    cases.push(
      ...(await evaluate("(" + inspectStudentCreate.toString() + ")()")),
    );
    await evaluate(
      "document.querySelector('.student-add').scrollIntoView({block:'center'})",
    );
    await delay(50);
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(previews, width + ".png"),
      Buffer.from(shot.data, "base64"),
    );
    await evaluate("goSchools()");
  }
  console.log("Student create previews: " + previews);
};
