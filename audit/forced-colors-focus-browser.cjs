"use strict";

// Production CSS, native keyboard focus, and a fresh temporary Edge profile.
// The shared harness supplies synthetic data; this audit only adds temporary DOM.
const { main } = require("./data-integrity.cjs");
const { settleThemePaint } = require("./theme-browser.cjs");

function hasSystemFocus(observed) {
  return (
    observed.forcedColors &&
    observed.focused &&
    observed.focusVisible &&
    observed.outlineStyle === "solid" &&
    observed.outlineWidth === "2px" &&
    observed.outlineOffset === "2px" &&
    observed.outlineColor === observed.highlight &&
    observed.borders.every((color) => color === observed.highlight) &&
    observed.boxShadow === "none"
  );
}

async function prepareFocusFixture() {
  await EduV24.test.settle();
  // The export API flushes drafts and adds an export timestamp. Compare the
  // installation through a readonly transaction so this audit causes no writes.
  const readInstallation = async () => {
    const request = (operation) =>
      new Promise((resolve, reject) => {
        operation.onsuccess = () => resolve(operation.result);
        operation.onerror = () => reject(operation.error);
      });
    const database = await request(
      indexedDB.open(EduDataStoreSchema.databaseName),
    );
    try {
      const names = [...database.objectStoreNames];
      const transaction = database.transaction(names, "readonly");
      const stores = await Promise.all(
        names.map(async (name) => {
          const store = transaction.objectStore(name);
          const [keys, values] = await Promise.all([
            request(store.getAllKeys()),
            request(store.getAll()),
          ]);
          return [name, keys, values];
        }),
      );
      return JSON.stringify({
        stores,
        localStorage: Object.keys(localStorage)
          .sort()
          .map((key) => [key, localStorage.getItem(key)]),
      });
    } finally {
      database.close();
    }
  };
  const fixture = document.createElement("section");
  fixture.id = "forced-colors-focus-audit";
  fixture.style.cssText =
    "position:fixed;inset:12px;z-index:2147483647;overflow:auto;background:Canvas;padding:12px;";
  const saved = {
    fixture,
    active: document.activeElement,
    scroll: [scrollX, scrollY],
    data: JSON.stringify(db),
    readInstallation,
    installation: await readInstallation(),
  };
  globalThis.__forcedColorsFocusAudit = saved;
  const variants = [
    ["input", "normal"],
    ["input", "invalid"],
    ["input", "readonly"],
    ["input", "readonly-invalid"],
    ["select", "normal"],
    ["select", "invalid"],
    ["textarea", "normal"],
    ["textarea", "invalid"],
    ["textarea", "readonly"],
    ["textarea", "readonly-invalid"],
    ["input", "date"],
    ["input", "date-invalid"],
    ["input", "checkbox"],
    ["input", "radio"],
    ["input", "range"],
  ];
  for (const [tag, variant] of variants) {
    const row = document.createElement("div");
    const sentinel = document.createElement("button");
    sentinel.type = "button";
    sentinel.textContent = "Tab to " + tag + " " + variant;
    sentinel.dataset.focusSentinel = `${tag}-${variant}`;
    const field = document.createElement(tag);
    field.id = `focus-audit-${tag}-${variant}`;
    field.setAttribute("aria-label", tag + " " + variant);
    if (tag === "select") {
      const option = document.createElement("option");
      option.textContent = "Synthetic option";
      field.append(option);
    } else if (tag === "input") {
      field.type = variant.startsWith("date")
        ? "date"
        : ["checkbox", "radio", "range"].includes(variant)
          ? variant
          : "text";
    }
    if (variant.includes("readonly")) field.readOnly = true;
    if (variant.includes("invalid")) field.setAttribute("aria-invalid", "true");
    row.append(sentinel, field);
    fixture.append(row);
  }
  document.getElementById("app").append(fixture);
  // Exercise the real readonly Shamsi proxy produced by the application.
  initShamsiPickers();
  const targets = variants.map(([tag, variant]) => {
    const sourceId = `focus-audit-${tag}-${variant}`;
    const id = variant.startsWith("date") ? sourceId + "-shamsi" : sourceId;
    if (variant === "date-invalid")
      document.getElementById(id).setAttribute("aria-invalid", "true");
    return {
      id,
      key: `${tag}-${variant}`,
      textField: !["checkbox", "radio", "range"].includes(variant),
    };
  });
  const probe = document.createElement("i");
  probe.dataset.focusProbe = "true";
  probe.style.cssText =
    "position:absolute;forced-color-adjust:none;color:Highlight";
  fixture.append(probe);
  return targets;
}

function inspectFocusedField(id) {
  const fixture = globalThis.__forcedColorsFocusAudit.fixture;
  const field = document.getElementById(id);
  const style = getComputedStyle(field);
  const probe = fixture.querySelector("[data-focus-probe]");
  const invalid = field.getAttribute("aria-invalid") === "true";
  probe.style.borderColor = invalid
    ? "var(--field-error-line)"
    : "var(--field-focus-line)";
  probe.style.boxShadow = invalid
    ? "0 0 0 3px var(--field-error-ring)"
    : "0 0 0 3px var(--field-focus-ring)";
  const expected = getComputedStyle(probe);
  return {
    forcedColors: matchMedia("(forced-colors: active)").matches,
    focused: document.activeElement === field,
    focusVisible: field.matches(":focus-visible"),
    readonly: field.readOnly,
    shamsi: field.hasAttribute("data-gregorian-target"),
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineOffset: style.outlineOffset,
    outlineColor: style.outlineColor,
    borders: ["Top", "Right", "Bottom", "Left"].map(
      (side) => style[`border${side}Color`],
    ),
    boxShadow: style.boxShadow,
    background: style.backgroundColor,
    color: style.color,
    highlight: expected.color,
    normalBorder: expected.borderTopColor,
    normalShadow: expected.boxShadow,
  };
}

async function restoreFocusFixture() {
  const saved = globalThis.__forcedColorsFocusAudit;
  if (!saved) return null;
  saved.fixture.remove();
  if (saved.active?.isConnected) saved.active.focus({ preventScroll: true });
  window.scrollTo(...saved.scroll);
  await EduV24.test.settle();
  const restored = {
    domRemoved: !document.getElementById("forced-colors-focus-audit"),
    dataUnchanged: saved.data === JSON.stringify(db),
    installationUnchanged:
      saved.installation === (await saved.readInstallation()),
  };
  delete globalThis.__forcedColorsFocusAudit;
  return restored;
}

async function run({ cdp, evaluate, cases, delay }) {
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const add = (id, name, pass, observed) =>
    cases.push({ id, name, pass: !!pass, observed });
  const originalMedia = await evaluate(
    'matchMedia("(forced-colors: active)").matches',
  );
  const normal = new Map();
  try {
    const targets = await evaluate(
      "(" + prepareFocusFixture.toString() + ")()",
    );
    const focus = async ({ id, key }) => {
      await evaluate(
        `document.querySelector('[data-focus-sentinel="${key}"]').focus({preventScroll:true})`,
      );
      for (const type of ["keyDown", "keyUp"])
        await cdp("Input.dispatchKeyEvent", {
          type,
          key: "Tab",
          code: "Tab",
          windowsVirtualKeyCode: 9,
          nativeVirtualKeyCode: 9,
        });
      await evaluate("(" + settleThemePaint.toString() + ")()");
      return evaluate(
        "(" + inspectFocusedField.toString() + ")(" + JSON.stringify(id) + ")",
      );
    };
    await cdp("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "forced-colors", value: "none" }],
    });
    for (const target of targets) {
      const observed = await focus(target);
      normal.set(target.key, observed);
      if (target.textField)
        add(
          "FORCED_FOCUS_NORMAL_" + target.key,
          "Normal keyboard focus retains the existing field ring: " +
            target.key,
          !observed.forcedColors &&
            observed.focused &&
            observed.focusVisible &&
            observed.outlineStyle === "none" &&
            observed.outlineOffset === "0px" &&
            observed.borders.every(
              (color) => color === observed.normalBorder,
            ) &&
            observed.boxShadow === observed.normalShadow &&
            observed.boxShadow !== "none" &&
            (!target.key.includes("date") ||
              (observed.shamsi && observed.readonly)),
          observed,
        );
    }
    await cdp("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "forced-colors", value: "active" }],
    });
    for (const target of targets) {
      const observed = await focus(target);
      add(
        "FORCED_FOCUS_SYSTEM_" + target.key,
        "Forced colors shows a system outline after keyboard Tab: " +
          target.key,
        hasSystemFocus(observed),
        observed,
      );
    }
    await cdp("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "forced-colors", value: "none" }],
    });
    for (const target of targets) {
      const observed = await focus(target);
      add(
        "FORCED_FOCUS_RESTORED_" + target.key,
        "Leaving forced colors restores normal field appearance: " + target.key,
        JSON.stringify(observed) === JSON.stringify(normal.get(target.key)),
        observed,
      );
    }
  } finally {
    await cdp("Emulation.setEmulatedMedia", { media: "", features: [] });
    const restored = await evaluate(
      "(" + restoreFocusFixture.toString() + ")()",
    );
    const mediaRestored = await evaluate(
      'matchMedia("(forced-colors: active)").matches',
    );
    add(
      "FORCED_FOCUS_CLEANUP",
      "Focus audit restores native media and removes its DOM without data writes",
      restored?.domRemoved &&
        restored.dataUnchanged &&
        restored.installationUnchanged &&
        mediaRestored === originalMedia,
      { ...restored, mediaRestored, originalMedia },
    );
  }
}

module.exports = run;
module.exports.hasSystemFocus = hasSystemFocus;
if (require.main === module)
  main({ stage: "forced-colors-keyboard-focus", runExtra: run }).catch(
    (error) => {
      console.error(error.stack || String(error));
      process.exitCode = 2;
    },
  );
