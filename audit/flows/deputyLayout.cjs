"use strict";

// A real rendered-screen check; no stylesheet overrides or fabricated DOM.
module.exports = async function deputyLayout({
  view,
  width,
  height,
  touch,
  packet,
}) {
  const cases = [],
    check = (suffix, name, pass, observed = {}) =>
      cases.push({
        id: "DEPUTY_LAYOUT_" + width + "x" + height + "_" + view + "_" + suffix,
        name,
        pass: !!pass,
        observed,
      }),
    visible = (node) => {
      if (
        !node ||
        !node.getClientRects().length ||
        getComputedStyle(node).visibility === "hidden"
      )
        return false;
      for (
        let parent = node.parentElement;
        parent;
        parent = parent.parentElement
      )
        if (
          parent.tagName === "DETAILS" &&
          !parent.open &&
          !parent.querySelector("summary")?.contains(node)
        )
          return false;
      return (
        !node.checkVisibility ||
        node.checkVisibility({
          checkVisibilityCSS: true,
          contentVisibilityAuto: true,
        })
      );
    },
    wait = async (predicate) => {
      for (let i = 0; i < 160; i++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Deputy layout screen did not settle: " +
          view +
          "/" +
          EduDeputyUI.status().message,
      );
    },
    tab = (name) => {
      const button = [
        ...document.querySelectorAll('[data-deputy-tab="' + name + '"]'),
      ].find(visible);
      if (!button) throw Error("No visible deputy navigation for " + name);
      button.click();
    },
    choose = async (inputId, value) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([JSON.stringify(value)], "layout-preview.json", {
          type: "application/json",
        }),
      );
      const input = document.getElementById(inputId);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(() => !EduDeputyUI.status().busy);
      if (EduDeputyUI.status().error) throw Error(EduDeputyUI.status().message);
    },
    expectedTab =
      view === "calendar"
        ? "reports"
        : ["files", "reports", "followups"].includes(view)
          ? view
          : "receive";
  if (document.getElementById("deputyBackupDialog")?.open)
    document.querySelector('[data-deputy-action="close-backups"]').click();
  await wait(() =>
    [
      ...document.querySelectorAll('[data-deputy-tab="' + expectedTab + '"]'),
    ].some(visible),
  );
  tab(expectedTab);
  if (["backup", "restore-preview"].includes(view))
    document.querySelector('[data-deputy-action="open-backups"]').click();
  await wait(() => !EduDeputyUI.status().busy);
  for (const details of document.querySelectorAll(
    ".ed-sources details,.ed-sources.ed-disclosure",
  ))
    details.open = true;
  if (view === "reports") {
    for (const details of document.querySelectorAll(".ed-session,.ed-lesson"))
      details.open = true;
  } else if (view === "calendar") {
    document.getElementById("deputyFrom-shamsi").click();
    await wait(() =>
      document.getElementById("calPopup")?.classList.contains("open"),
    );
  } else if (view === "followups") {
    const form = document.getElementById("deputyFollowupForm");
    for (
      let parent = form?.parentElement;
      parent;
      parent = parent.parentElement
    )
      if (parent.tagName === "DETAILS") parent.open = true;
  } else if (view === "import-preview") {
    const preview = structuredClone(packet);
    preview.id = "deputy_layout_preview";
    preview.sender.code = "DEPUTY-LAYOUT-ONLY";
    await choose("deputyImportFile", preview);
  } else if (view === "restore-preview") {
    const store = await EduDeputyStore.open();
    try {
      await choose("deputyRestoreFile", await store.backup());
    } finally {
      store.close();
    }
  } else if (view === "backup") {
    if (!document.getElementById("deputyBackupDialog").open)
      throw Error("Backup modal did not open");
  }
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const bottom = document.getElementById("deputyBottomNav"),
    desktop = document.getElementById("deputyDesktopNav"),
    coarse = matchMedia("(pointer: coarse)").matches,
    shouldUseBottom = width <= 700 || (width <= 1000 && coarse),
    nav = shouldUseBottom ? bottom : desktop,
    controls = [
      ...document.querySelectorAll(
        "#deputyApp button,#deputyApp a.ed-button,#calPopup.open button",
      ),
    ].filter(visible),
    small = controls
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        // The user explicitly chose the teacher's existing 300px/7-column grid.
        // Its shared day cells are narrower than 44px; height remains 44px.
        return (
          rect.height < 43.5 ||
          (!node.closest("#calPopup .cal-days") && rect.width < 43.5)
        );
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: (node.getAttribute("aria-label") || node.textContent).trim(),
          width: rect.width,
          height: rect.height,
        };
      }),
    navButtons = [...(nav?.querySelectorAll("button") || [])].filter(visible),
    navBoxes = navButtons.map((node) => node.getBoundingClientRect()),
    overlaps = navBoxes.some((box, i) =>
      navBoxes
        .slice(i + 1)
        .some(
          (other) =>
            Math.min(box.right, other.right) - Math.max(box.left, other.left) >
              1 &&
            Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) >
              1,
        ),
    );
  check(
    "bounds",
    "deputy " +
      view +
      " fits " +
      width +
      "x" +
      height +
      " without horizontal page scrolling",
    document.documentElement.scrollWidth <= innerWidth + 1 &&
      document.body.scrollWidth <= innerWidth + 1,
    {
      viewport: innerWidth,
      page: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    },
  );
  check(
    "navigation",
    "deputy " +
      view +
      " uses the same mobile/coarse-tablet navigation breakpoint as the teacher surface",
    visible(bottom) === shouldUseBottom &&
      visible(desktop) === !shouldUseBottom &&
      navButtons.length === 4 &&
      !overlaps &&
      navButtons.filter((node) => node.getAttribute("aria-current") === "page")
        .length === 1 &&
      (!touch || navigator.maxTouchPoints > 0),
    {
      width,
      height,
      coarse,
      touchPoints: navigator.maxTouchPoints,
      expectedBottom: shouldUseBottom,
      bottom: visible(bottom),
      desktop: visible(desktop),
      buttons: navButtons.length,
    },
  );
  check(
    "targets",
    "deputy " +
      view +
      " retains 44-pixel button heights and the intentional shared teacher calendar cell widths",
    small.length === 0,
    { small: small.slice(0, 8), totalSmall: small.length },
  );
  if (view === "calendar") {
    const dialog = document.getElementById("calPopup"),
      rect = dialog.getBoundingClientRect();
    check(
      "calendar",
      "Jalali calendar fits the viewport and opens with keyboard focus inside its dialog",
      rect.left >= -1 &&
        rect.right <= innerWidth + 1 &&
        rect.top >= -1 &&
        rect.bottom <= innerHeight + 1 &&
        dialog.contains(document.activeElement) &&
        !!dialog.querySelector(
          '[data-calendar-action="select"][data-calendar-day]',
        ),
      {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: innerWidth,
        height: innerHeight,
        focus: document.activeElement?.id,
      },
    );
  }
  if (view === "import-preview")
    check(
      "preview",
      "responsive import preview keeps confirmation and cancellation visible in its panel",
      visible(document.getElementById("deputyImportPreview")) &&
        visible(
          document.querySelector('[data-deputy-action="confirm-import"]'),
        ) &&
        visible(
          document.querySelector('[data-deputy-action="cancel-preview"]'),
        ),
    );
  if (view === "restore-preview")
    check(
      "preview",
      "responsive restore preview keeps its explicit consent and disabled replacement action visible",
      visible(document.getElementById("deputyRestorePreview")) &&
        visible(document.getElementById("deputyRestoreConsent")) &&
        visible(
          document.querySelector('[data-deputy-action="confirm-restore"]'),
        ) &&
        document.querySelector('[data-deputy-action="confirm-restore"]')
          .disabled,
    );
  if (view === "backup")
    check(
      "backup",
      "responsive deputy backup section exposes download, restore and the last-operation safety file",
      ["backup", "choose-restore", "safety-backup"].every((action) =>
        visible(
          document.querySelector('[data-deputy-action="' + action + '"]'),
        ),
      ),
    );
  if (view === "calendar") {
    const close = document.querySelector("#calPopup .calendar-close");
    close.focus();
    close.scrollIntoView({ block: "nearest", behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rect = close.getBoundingClientRect(),
      hit = document.elementFromPoint(
        (rect.left + rect.right) / 2,
        (rect.top + rect.bottom) / 2,
      );
    check(
      "occlusion",
      "the shared teacher calendar close action is scroll-reachable and hit-testable above fixed navigation",
      rect.top >= -1 &&
        rect.bottom <= innerHeight + 1 &&
        (hit === close || close.contains(hit)),
      {
        top: rect.top,
        bottom: rect.bottom,
        height: innerHeight,
        hit: hit?.tagName,
      },
    );
  } else if (document.getElementById("deputyBackupDialog")?.open) {
    const dialog = document.getElementById("deputyBackupDialog");
    const last = [...dialog.querySelectorAll("button:not(:disabled)")].at(-1);
    last.scrollIntoView({ block: "nearest", behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rect = last.getBoundingClientRect();
    const hit = document.elementFromPoint(
      (rect.left + rect.right) / 2,
      (rect.top + rect.bottom) / 2,
    );
    check(
      "occlusion",
      "backup modal actions scroll into view and receive clicks above the page navigation",
      rect.top >= 0 &&
        rect.bottom <= innerHeight &&
        (hit === last || last.contains(hit)),
      { bottom: rect.bottom, hit: hit?.tagName },
    );
  } else {
    window.scrollTo({
      top: document.scrollingElement.scrollHeight,
      behavior: "instant",
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const navTop = visible(bottom)
        ? bottom.getBoundingClientRect().top
        : innerHeight,
      lastControl = controls
        .filter((node) => !node.closest(".ed-bottom-nav,.ed-tabs,.ed-header"))
        .at(-1),
      lastBox = lastControl?.getBoundingClientRect();
    check(
      "occlusion",
      "deputy " +
        view +
        " leaves the last content action above its fixed bottom navigation",
      !lastBox || lastBox.bottom <= navTop + 1,
      {
        last: lastControl?.textContent.trim().slice(0, 80),
        lastBottom: lastBox?.bottom,
        navTop,
      },
    );
  }
  const focus = [
    ...document.querySelectorAll(
      "#deputyApp input:not([type=file]):not([type=checkbox]),#deputyApp textarea,#deputyApp select",
    ),
  ].find((node) => visible(node) && !node.disabled);
  if (
    focus &&
    view !== "calendar" &&
    !document.getElementById("deputyBackupDialog")?.open
  ) {
    focus.focus();
    focus.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rect = focus.getBoundingClientRect();
    check(
      "focus",
      "deputy " +
        view +
        " keeps an actual focused form field in the visible workspace",
      document.activeElement === focus &&
        rect.left >= -1 &&
        rect.right <= innerWidth + 1 &&
        rect.top >= -1 &&
        rect.bottom <=
          (visible(bottom) ? bottom.getBoundingClientRect().top : innerHeight) +
            1,
      { id: focus.id, top: rect.top, bottom: rect.bottom, height: innerHeight },
    );
  }
  document.activeElement?.blur();
  window.scrollTo({ top: 0, behavior: "instant" });
  return cases;
};
