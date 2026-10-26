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
        "goSchool(db.schools[0].id);goClass(db.schools[0].classes[0].id);document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
      ],
      [
        "new-lesson",
        "setTab('lessons');document.querySelector('.create-panel').open=true;document.querySelector('.create-panel').scrollIntoView({block:'center'})",
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
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
};
