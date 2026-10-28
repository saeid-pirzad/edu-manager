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
  const directoryFits = () => {
    const list = document.querySelector(".dashboard-entities");
    const cards = [...list.querySelectorAll(":scope > .dashboard-entity")];
    const rects = cards.map((card) => card.getBoundingClientRect());
    return (
      getComputedStyle(list).gridTemplateColumns.trim().split(/\s+/).length ===
        1 &&
      rects.every(
        (rect, index) =>
          rect.left >= 0 &&
          rect.right <= innerWidth + 1 &&
          (!index || rect.top >= rects[index - 1].bottom),
      )
    );
  };
  add(
    "school cards use full-width stacked rows at every viewport",
    directoryFits(),
  );
  goSchool(db.schools[0].id);
  await pause();
  add(
    "class cards use full-width stacked rows at every viewport",
    directoryFits(),
  );
  goSchools();
  await pause();
  const tools = document.querySelector(".workspace-tools"),
    summary = tools.querySelector(":scope > summary");
  const navigation = document.querySelector(".navigation-menu");
  if (navigation) navigation.open = true;
  window.scrollTo(0, 0);
  await pause();
  const desktop =
    innerWidth > 700 &&
    !matchMedia("(max-width:1000px) and (pointer:coarse)").matches;
  const home = document.querySelector(".topbar .header-home");
  add(
    "home is visible in desktop navigation and hidden in the compact header",
    document.querySelectorAll(".topbar .header-home").length === 1 &&
      home.parentElement.matches(
        desktop ? ".header-actions" : ".header-brand",
      ) &&
      (desktop
        ? home === home.parentElement.firstElementChild &&
          home.getClientRects().length > 0
        : home.getClientRects().length === 0 &&
          !!document.querySelector(
            '#uiBottomNav [data-ui-nav="home"],#uiBottomNav button',
          )),
  );
  add(
    "tools replace settings in main navigation, with settings nested inside",
    !!tools.closest(".topbar .header-actions") &&
      !document.querySelector(".workspace-bar .workspace-tools") &&
      tools.querySelectorAll('[data-header-action="settings"]').length === 1,
  );
  add(
    "tools expand directly in compact navigation with advanced drafts collapsed",
    tools.open === !desktop &&
      !tools.querySelector(".workspace-draft-tools").open &&
      getComputedStyle(summary, "::after").content === "none" &&
      !tools.querySelector(".workspace-file-status,.workspace-tool-label"),
  );
  add(
    "active period belongs to the welcome banner and routine file status stays out of tools",
    !document.querySelector(".workspace-bar > strong") &&
      !!document.querySelector(".schools-welcome .schools-period-context") &&
      !tools.querySelector(".workspace-period-context,#singleFileBadge") &&
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
  if (desktop) summary.click();
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
    "backup has its own header entry while technical draft commands stay inside tools",
    !tools.querySelector('[data-workspace-action="backups"]') &&
      !!document.querySelector(
        '.header-actions > [data-workspace-action="backups"]',
      ) &&
      actions.filter((button) => button.getClientRects().length).length === 3 &&
      tools.querySelectorAll(".workspace-draft-tools button").length === 3,
  );
  const fits = () =>
    document.documentElement.scrollWidth <= innerWidth + 1 &&
    [...tools.querySelectorAll("button")]
      .filter((el) => el.getClientRects().length)
      .every((el) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth + 1 &&
          rect.height >= (desktop ? 44 : 40)
        );
      });
  add("workspace main actions fit touch and desktop viewports", fits());
  if (!desktop) {
    const navigationActions = [
      ...[
        ...document.querySelectorAll(".header-actions > .header-action"),
      ].filter((el) => el.getClientRects().length),
      ...tools.querySelectorAll(".workspace-tool-group > button"),
    ];
    const rects = navigationActions.map((el) => el.getBoundingClientRect());
    add(
      "compact navigation excludes duplicate bottom navigation actions and keeps labels unbroken",
      rects.every((rect) => rect.height >= 44) &&
        [
          ...document.querySelectorAll(
            '.navigation-menu [data-header-action="reports"],.navigation-menu [data-header-action="master"]',
          ),
        ].every((el) => el.getClientRects().length === 0) &&
        navigationActions.every((el) => el.scrollWidth <= el.clientWidth + 1),
    );
  }
  if (!desktop) {
    const bottomButtons = [...document.querySelectorAll("#uiBottomNav button")];
    add(
      "five bottom navigation buttons fit without wrapping or horizontal overflow",
      bottomButtons.length === 5 &&
        bottomButtons.every((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.left >= 0 &&
            rect.right <= innerWidth + 1 &&
            el.scrollWidth <= el.clientWidth + 1
          );
        }) &&
        !document
          .querySelector('.header-actions > [data-workspace-action="backups"]')
          .getClientRects().length,
    );
  }
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
  await pause();
  if (desktop) summary.click();
  const trigger = desktop
    ? summary
    : navigation.querySelector(":scope > summary");
  trigger.focus();
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  add(
    "Escape closes workspace tools and returns focus to its trigger",
    !tools.open && document.activeElement === trigger,
  );
  if (desktop) summary.click();
  document
    .querySelector(
      desktop
        ? '.header-actions > [data-workspace-action="backups"]'
        : '#uiBottomNav [data-view="backups"]',
    )
    .click();
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
  const sizes = [320, 390, 600, 768, 1024, 1280, 1440, 1920].map((width) => [
    width,
    900,
  ]);
  sizes.push([320, 568], [390, 667], [667, 375]);
  for (const [width, height] of sizes) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height,
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
      path.join(previews, width + "x" + height + ".png"),
      Buffer.from(shot.data, "base64"),
    );
    await evaluate("document.querySelector('.workspace-tools').open=false");
  }
  console.log("Workspace tools previews: " + previews);
};
