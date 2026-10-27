"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
async function inspectCourseLayout() {
  const results = [];
  const add = (name, pass, observed = {}) =>
    results.push({
      id: "CR-" + innerWidth + "-" + results.length,
      name,
      pass: !!pass,
      observed,
    });
  goSchool(db.schools[0].id);
  goClass(db.schools[0].classes[0].id);
  const panel = document.querySelector(".lesson-create");
  panel.open = true;
  const form = document.getElementById("courseEditor");
  const pause = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  await pause();
  const tabs = document.querySelector("#app > .tabs");
  const heading = document.querySelector("#app > .view-heading");
  add(
    "new course toggle follows the page heading and tabs like other create panels",
    tabs.getBoundingClientRect().bottom <=
      panel.getBoundingClientRect().top + 1 &&
      (!heading ||
        heading.getBoundingClientRect().bottom <=
          tabs.getBoundingClientRect().top + 1),
  );
  const visible = () =>
    [...form.querySelectorAll("input,select,button")].filter(
      (el) => el.getClientRects().length,
    );
  const fits = () =>
    form.scrollWidth <= form.clientWidth + 1 &&
    document.documentElement.scrollWidth <= innerWidth + 1 &&
    visible().every((control) => {
      const rect = control.getBoundingClientRect();
      return (
        rect.left >= 0 && rect.right <= innerWidth + 1 && rect.height >= 44
      );
    });
  add("dual course fields fit the available form at every viewport", fits());
  const dual = document.getElementById("courseDual");
  const columns = getComputedStyle(dual).gridTemplateColumns.split(" ").length;
  add(
    "dual fields use proportional columns instead of fixed-width desktop gaps",
    columns === (panel.clientWidth >= 602 ? 3 : 2) &&
      [...dual.querySelectorAll("label")].every(
        (label) =>
          label.getBoundingClientRect().width >=
          dual.clientWidth / columns - 14,
      ),
    { panelWidth: panel.clientWidth, columns },
  );
  const list = document.querySelector(".class-lessons");
  add(
    "new course panel follows the lesson list at every viewport",
    list.getBoundingClientRect().bottom <=
      panel.getBoundingClientRect().top + 1 &&
      !!(
        list.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
  );
  const method = document.getElementById("course_method");
  method.value = "modular";
  method.dispatchEvent(new Event("change", { bubbles: true }));
  await pause();
  const grid = document.querySelector("#courseModular > .course-grid");
  const modularColumns =
    getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  add(
    "modular fields use two or four balanced columns based on actual container width",
    fits() && modularColumns === (panel.clientWidth >= 922 ? 4 : 2),
    { panelWidth: panel.clientWidth, columns: modularColumns },
  );
  const controls = [
    ...grid.querySelectorAll("input:not([type=hidden]),select"),
  ];
  add(
    "modular controls align along each row without overflowing",
    controls.every(
      (control, index) =>
        index % modularColumns === 0 ||
        Math.abs(
          control.getBoundingClientRect().bottom -
            controls[index - 1].getBoundingClientRect().bottom,
        ) < 2,
    ),
  );
  return results;
}
module.exports = async function courseResponsive({
  cdp,
  evaluate,
  cases,
  delay,
}) {
  const previews = fs.mkdtempSync(
    path.join(os.tmpdir(), "edu-course-responsive-"),
  );
  for (const width of [
    320, 360, 390, 430, 600, 768, 820, 1024, 1280, 1440, 1920,
  ]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(50);
    cases.push(
      ...(await evaluate("(" + inspectCourseLayout.toString() + ")()")),
    );
    await evaluate(
      "document.querySelector('.lesson-create').scrollIntoView({block:'start'})",
    );
    await delay(50);
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(previews, width + "-modular.png"),
      Buffer.from(shot.data, "base64"),
    );
    await evaluate("EduV24.course.cancelEditor();goSchools()");
  }
  console.log("Course responsive previews: " + previews);
};
