"use strict";

// Header-only layout regression in the existing isolated synthetic profile.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { main } = require("./data-integrity.cjs");

function inspectNavbar() {
  const visible = (element) => {
    if (
      !element ||
      !element.getClientRects().length ||
      element.closest("[hidden]")
    )
      return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility !== "visible")
      return false;
    for (
      let ancestor = element.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (
        ancestor.tagName === "DETAILS" &&
        !ancestor.open &&
        !ancestor.querySelector(":scope > summary")?.contains(element)
      )
        return false;
    }
    return true;
  };
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  };
  const overlap = (first, second) =>
    Math.min(first.right, second.right) - Math.max(first.left, second.left) >
      1 &&
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 1;
  const header = document.querySelector("#app .topbar"),
    brand = header.querySelector("h1"),
    nav = header.querySelector(".navigation-menu"),
    actions = header.querySelector(".header-actions"),
    tools = header.querySelector(".workspace-tools");
  const compact = matchMedia(
    "(max-width:700px), (max-width:1000px) and (pointer:coarse)",
  ).matches;
  const trigger = compact
    ? nav.querySelector(":scope > summary")
    : tools.querySelector(":scope > summary");
  const headerBox = box(header),
    brandBox = box(brand),
    actionsBox = box(actions),
    menuBox = compact ? box(trigger) : actionsBox;
  const centerY = (rect) => (rect.top + rect.bottom) / 2;
  const rowAlignment = {
    brandCenterY: centerY(brandBox),
    actionsCenterY: centerY(actionsBox),
    actionsHeight: actionsBox.height,
    primaryControls: [
      ...actions.querySelectorAll(
        ":scope > button,:scope > .header-dropdown > .header-action,:scope > details > summary",
      ),
    ]
      .filter(visible)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          label: (element.getAttribute("aria-label") || element.textContent)
            .trim()
            .replace(/\s+/g, " "),
          centerY: centerY(box(element)),
          fontSize: style.fontSize,
          gap: style.gap,
          paddingInlineStart: style.paddingInlineStart,
          paddingInlineEnd: style.paddingInlineEnd,
        };
      }),
  };
  const controls = [...header.querySelectorAll("button,summary")]
    .filter(visible)
    .map((element) => ({
      label: (element.getAttribute("aria-label") || element.textContent)
        .trim()
        .replace(/\s+/g, " "),
      ...box(element),
      clipped: element.scrollWidth > element.clientWidth + 1,
    }));
  const insets = {
    left: Math.min(brandBox.left, menuBox.left) - headerBox.left,
    right: headerBox.right - Math.max(brandBox.right, menuBox.right),
    top: Math.min(brandBox.top, menuBox.top) - headerBox.top,
    bottom: headerBox.bottom - Math.max(brandBox.bottom, menuBox.bottom),
  };
  const collisions = [];
  for (let first = 0; first < controls.length; first++)
    for (let second = first + 1; second < controls.length; second++)
      if (overlap(controls[first], controls[second]))
        collisions.push([controls[first].label, controls[second].label]);
  const groupStyle = getComputedStyle(actions),
    rootStyle = getComputedStyle(document.documentElement);
  const logoFrame = brand.querySelector(".brand-mark"),
    logoImage = logoFrame?.querySelector("img");
  const logo =
    visible(logoFrame) && visible(logoImage)
      ? { frame: box(logoFrame), image: box(logoImage) }
      : null;
  const icons = [...header.querySelectorAll("button svg,summary svg")]
    .filter(visible)
    // A small dropdown caret is decoration, not a primary action icon.
    .filter((icon) => !icon.matches(".header-caret"))
    .map((icon) => ({
      kind: icon.matches(".menu-toggle-icon") ? "hamburger" : "action",
      label: icon
        .closest("button,summary")
        ?.textContent.trim()
        .replace(/\s+/g, " "),
      ...box(icon),
    }));
  const bottom = document.getElementById("uiBottomNav");
  return {
    width: innerWidth,
    coarse: matchMedia("(pointer:coarse)").matches,
    compact,
    header: headerBox,
    brand: brandBox,
    menu: menuBox,
    rowAlignment,
    insets,
    brandMenuOverlap: overlap(brandBox, menuBox),
    controls,
    logo,
    icons,
    collisions,
    open: compact ? nav.open : tools.open,
    groupBorders: [
      groupStyle.borderTopWidth,
      groupStyle.borderRightWidth,
      groupStyle.borderBottomWidth,
      groupStyle.borderLeftWidth,
    ],
    groupGap: groupStyle.gap,
    background: getComputedStyle(header).backgroundColor,
    brandColor: getComputedStyle(brand).color,
    logoBackground: getComputedStyle(brand.querySelector(".brand-mark"))
      .backgroundColor,
    tokens: Object.fromEntries(
      ["primary", "highlight", "canvas", "nav"].map((name) => [
        name,
        rootStyle.getPropertyValue("--theme-" + name).trim(),
      ]),
    ),
    noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    bottom: bottom
      ? [...bottom.querySelectorAll("button")].filter(visible).map(box)
      : [],
  };
}

async function prepareNavbar() {
  closeModal();
  document.getElementById("pwaWelcomeLater")?.click();
  goSchools();
  scrollTo(0, 0);
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const compact = matchMedia(
    "(max-width:700px), (max-width:1000px) and (pointer:coarse)",
  ).matches;
  const nav = document.querySelector(".topbar .navigation-menu"),
    tools = document.querySelector(".topbar .workspace-tools");
  const trigger = compact
    ? nav.querySelector(":scope > summary")
    : tools.querySelector(":scope > summary");
  if (compact ? nav.open : tools.open) trigger.click();
  globalThis.__navbarAuditTrigger = trigger;
  return compact;
}

async function run({ cdp, evaluate, cases, delay }) {
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "edu-navbar-browser-"),
    ),
    observations = [];
  const add = (id, name, pass, observed) =>
    cases.push({ id: "NAVBAR_" + id, name, pass: !!pass, observed });
  const call = (method) => evaluate("(" + method.toString() + ")()");
  const pause = () => delay(160);
  const escape = async () => {
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await pause();
  };
  const scenarios = [
    ...[
      320, 390, 600, 700, 701, 768, 834, 900, 1000, 1001, 1023, 1024, 1100,
      1101, 1280, 1281, 1440,
    ].map((width) => ({ width, height: 1000, touch: false })),
    { width: 768, height: 1024, touch: true },
    { width: 1024, height: 768, touch: true },
  ];
  const phases = [false, true],
    expectedScreenshots = scenarios.length * phases.length;
  for (const scenario of scenarios) {
    const { width, height, touch } = scenario,
      suffix = width + (touch ? "_coarse" : "_fine"),
      expectedIconSizes = {
        logo: width <= 700 ? 36 : width <= 1100 ? 44 : 48,
        action: width <= 1023 ? 18 : width <= 1280 ? 20 : 22,
        hamburger: width <= 700 ? 22 : width <= 1100 ? 24 : null,
      };
    await cdp("Emulation.setTouchEmulationEnabled", {
      enabled: touch,
      maxTouchPoints: touch ? 5 : 1,
    });
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: touch,
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 0,
      y: 0,
      buttons: 0,
    });
    await call(prepareNavbar);
    await pause();
    const snapshots = [];
    for (const open of phases) {
      if (open) await evaluate("globalThis.__navbarAuditTrigger.click()");
      await pause();
      const result = await call(inspectNavbar);
      observations.push({
        scenario,
        phase: open ? "open" : "closed",
        ...result,
      });
      snapshots.push(result);
      const id = suffix + "_" + (open ? "open" : "closed");
      add(
        "EDGES_" + id,
        "Header content has healthy inner padding at " + id,
        Object.values(result.insets).every((gap) => gap >= 9.5),
        result.insets,
      );
      add(
        "FIT_" + id,
        "Header, brand, menus and touch controls fit without overlap at " + id,
        result.open === open &&
          result.noOverflow &&
          !result.brandMenuOverlap &&
          result.collisions.length === 0 &&
          result.controls.length > 0 &&
          result.controls.every(
            (control) =>
              control.left >= -1 &&
              control.right <= width + 1 &&
              control.width >= 43.5 &&
              control.height >= 43.5 &&
              !control.clipped,
          ),
        {
          header: result.header,
          brand: result.brand,
          menu: result.menu,
          controls: result.controls,
          collisions: result.collisions,
          open: result.open,
        },
      );
      add(
        "RESPONSIVE_ICONS_" + id,
        "Visible header logos and action icons use their viewport-specific sizes at " +
          id,
        (() => {
          const square = (rect, size) =>
            Math.abs(rect.width - size) <= 0.5 &&
            Math.abs(rect.height - size) <= 0.5;
          return (
            (!result.logo ||
              (square(result.logo.frame, expectedIconSizes.logo) &&
                square(result.logo.image, expectedIconSizes.logo * 1.2))) &&
            result.icons.length > 0 &&
            result.icons.every(
              (icon) =>
                expectedIconSizes[icon.kind] !== null &&
                square(icon, expectedIconSizes[icon.kind]),
            )
          );
        })(),
        {
          expected: expectedIconSizes,
          logo: result.logo,
          icons: result.icons,
        },
      );
      if (!result.compact)
        add(
          "SINGLE_ROW_" + id,
          "The brand and every primary header action share one vertically centered row at " +
            id,
          result.rowAlignment.actionsHeight > 0 &&
            Math.abs(
              result.rowAlignment.brandCenterY -
                result.rowAlignment.actionsCenterY,
            ) <= 1 &&
            result.rowAlignment.primaryControls.length > 0 &&
            result.rowAlignment.primaryControls.every(
              (control) =>
                Math.abs(control.centerY - result.rowAlignment.brandCenterY) <=
                1,
            ),
          result.rowAlignment,
        );
      if (!result.compact && width >= 701 && width <= 1280)
        add(
          "DENSITY_" + id,
          "Tablet and LG menus use readable compact spacing without reducing touch targets at " +
            id,
          result.groupGap === "3px" &&
            result.rowAlignment.primaryControls.length > 0 &&
            result.rowAlignment.primaryControls.every(
              (control) =>
                control.fontSize === "12px" &&
                control.gap === "3px" &&
                control.paddingInlineStart === "4px" &&
                control.paddingInlineEnd === "4px",
            ),
          {
            groupGap: result.groupGap,
            primaryControls: result.rowAlignment.primaryControls,
          },
        );
      add(
        "PALETTE_" + id,
        "Header colors and the transparent logo remain unchanged at " + id,
        result.background === "rgb(88, 89, 91)" &&
          result.brandColor === "rgb(255, 255, 255)" &&
          result.logoBackground === "rgba(0, 0, 0, 0)" &&
          result.tokens.primary === "#c0141b" &&
          result.tokens.highlight === "#fcaf17" &&
          result.tokens.canvas === "#f7f6f4" &&
          result.tokens.nav === "#58595b",
        {
          background: result.background,
          brandColor: result.brandColor,
          logoBackground: result.logoBackground,
          tokens: result.tokens,
        },
      );
      if (width >= 701)
        add(
          "GROUP_BORDER_" + id,
          "The desktop or tablet action group has no surrounding pill border at " +
            id,
          result.groupBorders.every((value) => parseFloat(value) === 0),
          result.groupBorders,
        );
      if (result.compact)
        add(
          "BOTTOM_" + id,
          "The five compact bottom-navigation targets remain visible and fit at " +
            id,
          result.bottom.length === 5 &&
            result.bottom.every(
              (button) =>
                button.width >= 43.5 &&
                button.height >= 43.5 &&
                button.left >= -1 &&
                button.right <= width + 1,
            ),
          result.bottom,
        );
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(directory, "navbar-" + id + ".png"),
        Buffer.from(shot.data, "base64"),
      );
    }
    add(
      "POINTER_" + suffix,
      "The requested fine or coarse pointer is actually active at " + suffix,
      snapshots[0].coarse === touch,
      {
        expectedCoarse: touch,
        actualCoarse: snapshots[0].coarse,
        compact: snapshots[0].compact,
      },
    );
    add(
      "STABLE_" + suffix,
      "Opening header menus preserves the brand and bottom-navigation geometry at " +
        suffix,
      ["left", "right", "top", "bottom", "width", "height"].every(
        (key) =>
          Math.abs(snapshots[0].brand[key] - snapshots[1].brand[key]) <= 1,
      ) &&
        JSON.stringify(snapshots[0].bottom) ===
          JSON.stringify(snapshots[1].bottom),
      { before: snapshots[0].brand, after: snapshots[1].brand },
    );
    await evaluate("globalThis.__navbarAuditTrigger.focus()");
    await escape();
    const keyboard = await evaluate(`(()=>{
      const trigger=globalThis.__navbarAuditTrigger, compact=matchMedia('(max-width:700px), (max-width:1000px) and (pointer:coarse)').matches;
      const parent=trigger.parentElement, style=getComputedStyle(trigger);
      return {closed:!parent.open,focused:document.activeElement===trigger,outlineWidth:style.outlineWidth,outlineStyle:style.outlineStyle,compact};
    })()`);
    add(
      "ESCAPE_" + suffix,
      "Escape closes the active menu and preserves its keyboard focus indicator at " +
        suffix,
      keyboard.closed &&
        keyboard.focused &&
        parseFloat(keyboard.outlineWidth) >= 2 &&
        keyboard.outlineStyle !== "none",
      keyboard,
    );
    if (!touch && [390, 1280].includes(width)) {
      await evaluate("globalThis.__navbarAuditTrigger.click()");
      await pause();
      await evaluate(
        "(()=>{const target=document.querySelector('.topbar [data-header-action=\"settings\"]');target.focus();target.click()})()",
      );
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          await evaluate(
            "!document.getElementById('modal').classList.contains('hidden')",
          )
        )
          break;
        await delay(25);
      }
      await escape();
      await pause();
      const restored = await evaluate(`(()=>{
        const active=document.activeElement, box=active.getBoundingClientRect();
        return {closed:document.getElementById('modal').classList.contains('hidden'),inHeader:!!active.closest('.topbar'),visible:box.width>0&&box.height>0,notInert:!active.closest('[inert]'),label:active.textContent.trim()};
      })()`);
      add(
        "MODAL_FOCUS_" + suffix,
        "Closing actual settings returns focus to a reachable header control at " +
          suffix,
        restored.closed &&
          restored.inHeader &&
          restored.visible &&
          restored.notInert,
        restored,
      );
    }
  }
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
  await evaluate("delete globalThis.__navbarAuditTrigger");
  fs.writeFileSync(
    path.join(directory, "navbar-observations.json"),
    JSON.stringify(observations, null, 2) + "\n",
  );
  add(
    "ARTIFACTS",
    "Closed and open header previews were captured at every requested viewport",
    fs.readdirSync(directory).filter((name) => name.endsWith(".png")).length ===
      expectedScreenshots,
    { directory, screenshots: expectedScreenshots },
  );
  console.log("Navbar audit artifacts: " + directory);
}

module.exports = { run };
if (require.main === module)
  main({ stage: "navbar-layout", runExtra: run }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
