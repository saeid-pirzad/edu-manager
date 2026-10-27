"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
async function inspectMobileUx() {
  const cases = [],
    pause = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
  const add = (name, pass, observed = {}) =>
    cases.push({
      id: "UX-" + innerWidth + "-" + cases.length,
      name,
      pass: !!pass,
      observed,
    });
  const fits = () => document.documentElement.scrollWidth <= innerWidth + 1;
  const checkCreate = async (kind) => {
    const panel = document.querySelector(".create-panel");
    panel.open = false;
    panel.querySelector("summary").click();
    await pause();
    add(
      kind +
        " creation has one submit, a neutral heading and no injected duplicate add action",
      panel.open &&
        panel.querySelectorAll('[type="submit"]').length === 1 &&
        !/ثبت|افزودن/.test(panel.querySelector("summary").textContent) &&
        !document.querySelector(".mobile-add-action"),
    );
    add(kind + " expanded creation fits the viewport", fits());
    panel.open = false;
  };
  closeModal();
  goSchools();
  await pause();
  const field = document.querySelector(".entity-create-field input");
  add(
    "school creation is progressively disclosed with a persistent accessible label",
    !!field?.labels.length &&
      !document.querySelector(".entity-quick-create").open,
  );
  const badge = document.getElementById("singleFileBadge");
  add(
    "routine file status is discoverable in tools without occupying the main workflow",
    !badge || !!badge.closest(".workspace-tools"),
  );
  add("home fits the viewport without horizontal page scrolling", fits(), {
    width: document.documentElement.scrollWidth,
  });
  document.querySelector(".entity-quick-create").open = true;
  add(
    "Reactium palette uses warm background and red primary actions",
    getComputedStyle(document.body).backgroundColor === "rgb(247, 246, 244)" &&
      getComputedStyle(
        document.querySelector('.entity-quick-create button[type="submit"]'),
      ).backgroundColor === "rgb(192, 20, 27)",
  );
  add(
    "icons decorate controls without hiding readable labels",
    document.querySelectorAll("#app .control-icon svg").length >= 3 &&
      document
        .querySelector('.entity-quick-create button[type="submit"]')
        .textContent.trim().length > 0,
  );
  await pause();
  add(
    "expanded creation form has touch-sized controls",
    [
      ...document.querySelectorAll(
        ".entity-quick-create button,.entity-quick-create input",
      ),
    ].every((control) => control.getBoundingClientRect().height >= 44),
  );
  const enter = document.querySelector(".dashboard-entity .entity-enter");
  add(
    "school entry has one arrow, a clear destination label and a touch target",
    getComputedStyle(enter).backgroundColor === "rgb(254, 240, 240)" &&
      getComputedStyle(enter).color === "rgb(192, 20, 27)" &&
      enter.textContent.trim() === "کلاس‌های مدرسه" &&
      enter.querySelectorAll("svg").length === 1 &&
      enter.getBoundingClientRect().height >= 44,
  );
  const menu = document.querySelector(".dashboard-entity-more");
  menu.querySelector("summary").click();
  await pause();
  const panel = menu.querySelector(".entity-menu-panel");
  menu.scrollIntoView({ block: "center" });
  await pause();
  const rect = panel.getBoundingClientRect();
  add(
    "school actions float without escaping the viewport",
    menu.open &&
      getComputedStyle(panel).position === "absolute" &&
      rect.left >= -1 &&
      rect.right <= innerWidth + 1 &&
      [...panel.querySelectorAll("button")].every(
        (button) => button.getBoundingClientRect().height >= 44,
      ),
  );
  const nextMenu = document.querySelectorAll(".dashboard-entity-more")[1];
  if (nextMenu) {
    nextMenu.querySelector("summary").click();
    await pause();
    add(
      "opening another school menu closes the previous menu",
      nextMenu.open && !menu.open,
    );
  }
  document.querySelector(".workflow-welcome h2").click();
  await pause();
  add(
    "outside click closes school action disclosures",
    !document.querySelector(".dashboard-entity-more[open]"),
  );
  document.querySelector(".entity-quick-create").open = false;
  await checkCreate("school");
  const school = db.schools[0],
    classroom = school.classes[0];
  goSchool(school.id);
  await pause();
  await checkCreate("class");
  goClass(classroom.id);
  await pause();
  add("class view fits the viewport", fits());
  add(
    "selecting a class lands on its own lessons",
    state.tab === "lessons" && !!document.querySelector(".class-lessons"),
  );
  setTab("students");
  await pause();
  await checkCreate("student");
  setTab("lessons");
  await pause();
  await checkCreate("lesson");
  setTab("students");
  await pause();
  add(
    "active section is announced without relying on color alone",
    document
      .querySelector("#app .tabs > button.active")
      ?.getAttribute("aria-pressed") === "true",
  );
  if (innerWidth <= 1000)
    add(
      "text inputs use readable non-zooming 16px text",
      [
        ...document.querySelectorAll(
          '#app input:not([type="checkbox"]):not([type="radio"])',
        ),
      ]
        .filter((control) => control.getBoundingClientRect().height)
        .every(
          (control) => parseFloat(getComputedStyle(control).fontSize) >= 16,
        ),
    );
  goReports();
  for (const mode of ["daily", "weekly", "monthly", "annual"]) {
    setReportTab(mode);
    await pause();
    const controls = document.querySelector(".periodic-controls");
    add(
      mode + " report has no duplicated nested field labels",
      !!controls && !controls.querySelector("label label"),
    );
    add(
      mode + " report preserves one date picker",
      controls.querySelectorAll('[data-gregorian-target="true"]').length ===
        (mode === "annual" ? 0 : 1),
    );
  }
  await openSettingsModal();
  await pause();
  const modal = document.querySelector(".modal-dialog"),
    close = document.getElementById("modalClose");
  add(
    "settings dialog and close target fit mobile and tablet widths",
    modal.getBoundingClientRect().left >= -1 &&
      modal.getBoundingClientRect().right <= innerWidth + 1 &&
      close.getBoundingClientRect().width >= 44 &&
      close.getBoundingClientRect().height >= 44,
  );
  const footer = document.querySelector(
    "#settingsEditor .record-editor-actions",
  );
  footer.scrollIntoView({ block: "end" });
  await pause();
  add(
    "settings save and cancel remain reachable",
    footer.getBoundingClientRect().bottom <= innerHeight + 1 &&
      [...footer.querySelectorAll("button")].every(
        (button) => button.getBoundingClientRect().height >= 44,
      ),
  );
  add(
    "bottom navigation cannot be activated behind the dialog",
    document.getElementById("uiBottomNav").inert,
  );
  closeModal();
  await EduV24.openBackups();
  await pause();
  const full = document.querySelector(
    '.backup-manual [data-workspace-action="export-full"]',
  );
  add(
    "backup controls have distinct local icons and preserved action labels",
    document.querySelector('[data-workspace-action="export-full"] .ui-icon') &&
      document.querySelector(
        '[data-workspace-action="choose-import"] .ui-icon',
      ) &&
      document.querySelector(
        '[data-workspace-action="single-file-choose"] .ui-icon',
      ),
  );
  add(
    "backup workflow prioritizes full export and keeps internal history secondary",
    full.getBoundingClientRect().height >= 44 &&
      !document.querySelector(".backup-history").open &&
      !!document.querySelector(".backup-help"),
  );
  closeModal();
  goSchools();
  await pause();
  goSchool(db.schools[0].id);
  goClass(db.schools[0].classes[0].id);
  await EduV24.course.open(db.schools[0].classes[0].lessons[0].id);
  await pause();
  const courseForm = document.getElementById("courseEditor");
  add(
    "course editor fields fit the viewport without horizontal scrolling",
    courseForm.scrollWidth <= courseForm.clientWidth + 1 &&
      [...courseForm.querySelectorAll("input,select")]
        .filter((control) => control.getClientRects().length)
        .every((control) => {
          const rect = control.getBoundingClientRect();
          return (
            rect.left >= 0 && rect.right <= innerWidth && rect.height >= 44
          );
        }),
  );
  const periodsRect = courseForm
    .querySelector("#course_periods")
    .getBoundingClientRect();
  const teacherRect = courseForm
    .querySelector("#course_teacher")
    .getBoundingClientRect();
  add(
    "short weekly-period and grade fields stay compact instead of filling wide rows",
    periodsRect.width <= 141 &&
      [...courseForm.querySelectorAll("#courseDual input:not([type=hidden])")]
        .filter((input) => input.getClientRects().length)
        .every(
          (input) =>
            input.getBoundingClientRect().width <=
            courseForm.querySelector("#courseDual").clientWidth / 2 + 1,
        ),
  );
  add(
    "related basic fields align on the same row except on narrow phones",
    innerWidth < 360 || Math.abs(periodsRect.bottom - teacherRect.bottom) <= 2,
  );
  const courseFooter = courseForm.querySelector(".record-editor-actions");
  courseFooter.scrollIntoView({ block: "end" });
  await pause();
  add(
    "course save and cancel remain reachable with touch-sized targets",
    courseFooter.getBoundingClientRect().bottom <= innerHeight + 1 &&
      [...courseFooter.querySelectorAll("button")].every(
        (button) => button.getBoundingClientRect().height >= 44,
      ),
  );
  add(
    "course keyboard order follows the displayed primary and optional sections",
    !!(
      courseForm
        .querySelector(".course-basic-fields")
        .compareDocumentPosition(courseForm.querySelector("#coursePolicy")) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ),
  );
  closeModal();
  goSchools();
  goSchool(db.schools[0].id);
  goClass(db.schools[0].classes[0].id);
  const beforeDeletion = JSON.stringify(db);
  const deletionLesson = db.schools[0].classes[0].lessons[0];
  deleteLesson(deletionLesson.id);
  await pause();
  const deletionForm = document.querySelector(".deletion-editor");
  add(
    "lesson deletion dialog explains the impact and defaults focus to cancellation",
    !!deletionForm &&
      document.activeElement ===
        deletionForm.querySelector('[data-workspace-action="close"]') &&
      deletionForm.textContent.includes("هنرجویان کلاس حذف نمی‌شوند") &&
      deletionForm.querySelector(".deletion-target bdi").textContent ===
        deletionLesson.name,
  );
  add(
    "lesson deletion fits the viewport and has touch-sized confirmation controls",
    deletionForm.scrollWidth <= deletionForm.clientWidth + 1 &&
      [...deletionForm.querySelectorAll("input,button")].every((control) => {
        const rect = control.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.height >= 44;
      }),
  );
  document.getElementById("deleteEntityName").value = "نام نادرست برای آزمون";
  deletionForm.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
  for (
    let attempt = 0;
    attempt < 100 && !document.getElementById("deleteEntityError").textContent;
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  add(
    "incorrect deletion confirmation preserves every record and shows an inline error",
    !!document.getElementById("deleteEntityError").textContent &&
      JSON.stringify(db) === beforeDeletion &&
      deletionForm.isConnected,
  );
  deletionForm.querySelector('[data-workspace-action="close"]').click();
  add(
    "cancelling lesson deletion closes the dialog without modifying data",
    document.getElementById("modal").classList.contains("hidden") &&
      JSON.stringify(db) === beforeDeletion,
  );
  const modularForm = document.getElementById("courseEditor");
  modularForm.closest("details").open = true;
  document.getElementById("course_method").value = "modular";
  document
    .getElementById("course_method")
    .dispatchEvent(new Event("change", { bubbles: true }));
  await pause();
  add(
    "modular counts and thresholds stay readable and compact at each breakpoint",
    [
      ...modularForm.querySelectorAll(
        "#courseModular input:not([type=hidden]),#courseModular select",
      ),
    ].every((control) => {
      const rect = control.getBoundingClientRect();
      return (
        rect.width <=
          modularForm.querySelector("#courseModular > .course-grid")
            .clientWidth /
            2 +
            1 &&
        rect.height >= 44 &&
        rect.left >= 0 &&
        rect.right <= innerWidth
      );
    }) && fits(),
  );
  EduV24.course.cancelEditor();
  goSchools();
  return cases;
}
module.exports = async function mobileUx({ cdp, evaluate, cases, delay }) {
  const previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-mobile-ux-"));
  for (const width of [320, 390, 768, 1024]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp("Emulation.setTouchEmulationEnabled", { enabled: true });
    await delay(100);
    cases.push(...(await evaluate("(" + inspectMobileUx.toString() + ")()")));
    for (const [name, action] of [
      ["home", "goSchools()"],
      [
        "school-actions",
        "goSchools();document.querySelector('.dashboard-entity-more').open=true;document.querySelector('.dashboard-entity').scrollIntoView({block:'center'})",
      ],
      ["settings", "openSettingsModal()"],
      ["backups", "EduV24.openBackups()"],
      [
        "new-school",
        "goSchools();document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
      ],
      [
        "new-class",
        "goSchool(db.schools[0].id);document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
      ],
      [
        "new-student",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);setTab('students');document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
      ],
      [
        "new-lesson",
        "setTab('lessons');document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
      ],
      [
        "edit-course",
        "EduV24.course.open(db.schools[0].classes[0].lessons[0].id)",
      ],
      [
        "delete-course",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);deleteLesson(db.schools[0].classes[0].lessons[0].id)",
      ],
      [
        "new-modular-course",
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);document.querySelector('.lesson-create').open=true;document.getElementById('course_method').value='modular';document.getElementById('course_method').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.lesson-create').scrollIntoView({block:'start'})",
      ],
    ]) {
      await evaluate("closeModal()");
      await evaluate(action);
      await delay(100);
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(previews, width + "-" + name + ".png"),
        Buffer.from(shot.data, "base64"),
      );
    }
    await evaluate("closeModal();goSchools()");
  }
  console.log("Mobile UI previews: " + previews);
  await require("./course-responsive.cjs")({ cdp, evaluate, cases, delay });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
};
