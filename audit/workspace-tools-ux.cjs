"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
async function inspectWorkspaceTools() {
  closeModal();
  goSchools();
  const cases = [],
    before = JSON.stringify(db);
  const add = (name, pass) =>
    cases.push({
      id: "TOOLS-" + innerWidth + "-" + cases.length,
      name,
      pass: !!pass,
    });
  const pause = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  await pause();
  const tools = document.querySelector(".workspace-tools"),
    summary = tools.querySelector(":scope > summary");
  const navigation = document.querySelector(".navigation-menu");
  if (navigation) navigation.open = true;
  await pause();
  add(
    "tools replace settings in main navigation, with settings nested inside",
    !!tools.closest(".topbar .header-actions") &&
      !document.querySelector(".workspace-bar .workspace-tools") &&
      tools.querySelectorAll('[data-header-action="settings"]').length === 1,
  );
  add(
    "workspace tools begin closed with advanced drafts collapsed",
    !tools.open &&
      !tools.querySelector(".workspace-draft-tools").open &&
      getComputedStyle(summary, "::after").content === "none" &&
      !tools.querySelector(".workspace-file-status,.workspace-tool-label"),
  );
  add(
    "active period is secondary inside tools and routine status does not occupy the header",
    !document.querySelector(".workspace-bar > strong") &&
      !!tools.querySelector(".workspace-period-context") &&
      (document.getElementById("saveStatus").dataset.state !== "saved" ||
        document.getElementById("saveStatus").hidden),
  );
  const stableElements = [
    document.querySelector(".topbar"),
    summary,
    ...document.querySelectorAll(
      ".header-actions > .header-action,.header-actions > .header-dropdown",
    ),
    document.querySelector(".workflow-welcome"),
  ];
  const beforeRects = stableElements.map((el) => el.getBoundingClientRect());
  summary.click();
  await pause();
  add(
    "opening tools preserves header, sibling actions and page content geometry",
    stableElements.every((el, index) => {
      const after = el.getBoundingClientRect(),
        before = beforeRects[index];
      return ["x", "y", "width", "height"].every(
        (key) => Math.abs(after[key] - before[key]) <= 1,
      );
    }),
  );
  const actions = [...tools.querySelectorAll("button")];
  add(
    "backup is the primary action and technical draft commands stay secondary",
    tools.querySelector("button").dataset.workspaceAction === "backups" &&
      actions.filter((button) => button.getClientRects().length).length === 4 &&
      tools.querySelectorAll(".workspace-draft-tools button").length === 3,
  );
  const fits = () =>
    document.documentElement.scrollWidth <= innerWidth + 1 &&
    [...tools.querySelectorAll("button")]
      .filter((el) => el.getClientRects().length)
      .every((el) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.left >= 0 && rect.right <= innerWidth + 1 && rect.height >= 44
        );
      });
  add("workspace main actions fit touch and desktop viewports", fits());
  tools.querySelector(".workspace-draft-tools > summary").click();
  await pause();
  add(
    "advanced commands expand without closing the parent or overflowing",
    tools.open && tools.querySelector(".workspace-draft-tools").open && fits(),
  );
  document.querySelector(".workflow-welcome h2").click();
  add(
    "outside click closes workspace tools without changing data",
    !tools.open && JSON.stringify(db) === before,
  );
  if (navigation) navigation.open = true;
  summary.click();
  summary.focus();
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  add(
    "Escape closes workspace tools and returns focus to its trigger",
    !tools.open && document.activeElement === summary,
  );
  summary.click();
  tools.querySelector('[data-workspace-action="backups"]').click();
  for (
    let attempt = 0;
    attempt < 100 &&
    !document.querySelector("#modal:not(.hidden) .backup-manual");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  add(
    "backup action opens the existing backup workflow and closes the tools disclosure",
    !tools.open &&
      !!document.querySelector(
        '#modal [data-workspace-action="export-full"]',
      ) &&
      !!document.querySelector(
        '#modal [data-workspace-action="choose-import"]',
      ) &&
      JSON.stringify(db) === before,
  );
  closeModal();
  await pause();
  const currentTools = document.querySelector(".workspace-tools");
  document.querySelector(".navigation-menu").open = true;
  currentTools.open = true;
  currentTools.querySelector('[data-header-action="settings"]').click();
  for (
    let attempt = 0;
    attempt < 100 &&
    !document.querySelector("#modal:not(.hidden) #settingsEditor");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  add(
    "nested settings opens the existing editor without changing data",
    !currentTools.open &&
      !!document.querySelector("#modal:not(.hidden) #settingsEditor") &&
      JSON.stringify(db) === before,
  );
  closeModal();
  await pause();
  return cases;
}
module.exports = async function workspaceToolsUx({
  cdp,
  evaluate,
  cases,
  delay,
}) {
  const previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-tools-ux-"));
  for (const width of [320, 390, 600, 768, 1024, 1280, 1440, 1920]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    cases.push(
      ...(await evaluate("(" + inspectWorkspaceTools.toString() + ")()")),
    );
    await evaluate(
      "document.querySelector('.navigation-menu').open=true;document.querySelector('.workspace-tools').open=true;document.querySelector('.workspace-tools').scrollIntoView({block:'start'})",
    );
    await delay(100);
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(previews, width + ".png"),
      Buffer.from(shot.data, "base64"),
    );
    await evaluate("document.querySelector('.workspace-tools').open=false");
  }
  console.log("Workspace tools previews: " + previews);
};
