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
  const school = db.schools[0],
    classroom = school.classes[0];
  goSchool(school.id);
  goClass(classroom.id);
  await pause();
  add("class view fits the viewport", fits());
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
