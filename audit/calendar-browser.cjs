"use strict";

// Exercises the shipped picker in a fresh temporary Edge profile. Fixtures live
// outside the application's render root and never write school or bank data.
const { main } = require("./data-integrity.cjs");
const fs = require("node:fs");
const path = require("node:path");

async function calendarChecks() {
  const cases = [],
    check = (id, pass, observed = {}) =>
      cases.push({ id: "CALENDAR_" + id, name: id, pass: !!pass, observed }),
    settle = async () => {
      for (let frame = 0; frame < 3; frame++)
        await new Promise(requestAnimationFrame);
    };
  closeModal();
  await settle();
  const saved = JSON.stringify(db),
    host = document.createElement("section"),
    popup = document.getElementById("calPopup");
  host.id = "calendarAuditHost";
  host.style.cssText =
    "position:fixed;inset:10px auto auto 10px;z-index:9000;max-width:280px;background:white;padding:8px";
  document.body.append(host);
  const field = (id, value = "2026-03-21", parent = host, attrs = {}) => {
    const label = document.createElement("label"),
      input = document.createElement("input");
    label.htmlFor = id;
    label.textContent = "تاریخ آزمایشی";
    input.id = id;
    input.type = "date";
    input.value = value;
    for (const [key, value] of Object.entries(attrs))
      input.setAttribute(key, value);
    parent.append(label, input);
    initShamsiPickers();
    return input;
  };
  const proxy = (input) => input.nextElementSibling,
    iso = (day) =>
      calendarISODate(...jalaliToGregorian(calViewYear, calViewMonth, day)),
    open = (input) => {
      closeShamsiCalendar();
      proxy(input).click();
    };
  globalThis.__calendarAudit = {
    host,
    popup,
    field,
    saved,
    async cleanup() {
      closeShamsiCalendar();
      document.body.append(popup);
      host.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
      host.remove();
      closeModal();
      await settle();
      const result = {
        dataUnchanged: JSON.stringify(db) === saved,
        calendarConnected: popup.isConnected,
        noSyntheticDOM: !document.getElementById("calendarAuditHost"),
      };
      delete globalThis.__calendarAudit;
      return result;
    },
  };
  const input = field("calendarAuditDate"),
    visible = proxy(input);
  initShamsiPickers();
  check(
    "IDEMPOTENT_AND_ACCESSIBLE",
    input.style.display === "none" &&
      host.querySelectorAll("#calendarAuditDate-shamsi").length === 1 &&
      visible.value === "۱۴۰۵/۰۱/۰۱" &&
      visible.readOnly &&
      visible.getAttribute("aria-label") === "تاریخ آزمایشی" &&
      visible.getAttribute("aria-haspopup") === "dialog",
    { native: input.value, visible: visible.value },
  );
  host.querySelector("label").click();
  check(
    "LABEL_FOCUSES_VISIBLE_CONTROL",
    document.activeElement === visible ||
      popup.contains(document.activeElement),
    { active: document.activeElement?.id },
  );
  closeShamsiCalendar();
  input.value = "2026-03-22";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  check("NATIVE_CHANGE_SYNCS_PROXY", visible.value === "۱۴۰۵/۰۱/۰۲", {
    visible: visible.value,
  });
  input.value = "2026-03-23";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  check("NATIVE_INPUT_SYNCS_PROXY", visible.value === "۱۴۰۵/۰۱/۰۳", {
    visible: visible.value,
  });
  input.value = "";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  check(
    "NATIVE_CLEAR_REMOVES_OLD_DATE",
    visible.value === "" && !visible.dataset.jy,
    { visible: visible.value, year: visible.dataset.jy },
  );
  input.value = "2026-03-24";
  initShamsiPickers();
  check(
    "REINITIALIZATION_SYNCS_EXISTING_PROXY",
    visible.value === "۱۴۰۵/۰۱/۰۴",
    {
      visible: visible.value,
    },
  );
  const form = document.createElement("form");
  host.append(form);
  const resetDate = field("calendarAuditReset", "2026-03-21", form);
  resetDate.defaultValue = "2026-03-21";
  resetDate.value = "2026-03-26";
  resetDate.dispatchEvent(new Event("change", { bubbles: true }));
  form.reset();
  await settle();
  check(
    "FORM_RESET_SYNCS_PROXY",
    resetDate.value === "2026-03-21" && proxy(resetDate).value === "۱۴۰۵/۰۱/۰۱",
    { native: resetDate.value, visible: proxy(resetDate).value },
  );
  const requiredForm = document.createElement("form");
  host.append(requiredForm);
  const requiredDate = field("calendarAuditRequired", "", requiredForm, {
    required: "",
  });
  const valid = requiredForm.reportValidity();
  await settle();
  check(
    "REQUIRED_INVALID_DATE_FOCUSES_VISIBLE_CONTROL",
    !valid &&
      !requiredDate.validity.valid &&
      (document.activeElement === proxy(requiredDate) ||
        popup.contains(document.activeElement)),
    { valid, active: document.activeElement?.id },
  );
  closeShamsiCalendar();

  for (const property of ["disabled", "readOnly"]) {
    input[property] = true;
    syncShamsiDisabledInputs();
    visible.click();
    check(
      "LOCKED_BEFORE_OPEN_" + property,
      visible.disabled && !popup.classList.contains("open"),
    );
    input[property] = false;
    syncShamsiDisabledInputs();
  }
  const initiallyDisabled = field(
    "calendarAuditInitiallyDisabled",
    "2026-03-21",
    host,
    { disabled: "" },
  );
  const wasDisabled = proxy(initiallyDisabled).disabled;
  initiallyDisabled.disabled = false;
  initShamsiPickers();
  check(
    "REINITIALIZATION_UPDATES_DISABLED_PROXY",
    wasDisabled && !proxy(initiallyDisabled).matches(":disabled"),
    { wasDisabled, disabled: proxy(initiallyDisabled).disabled },
  );
  const fields = document.createElement("fieldset");
  host.append(fields);
  const inherited = field("calendarAuditFieldset", "2026-03-21", fields);
  fields.disabled = true;
  syncShamsiDisabledInputs();
  proxy(inherited).click();
  check(
    "FIELDSET_LOCK_INHERITED",
    proxy(inherited).matches(":disabled") && !popup.classList.contains("open"),
  );
  fields.disabled = false;
  syncShamsiDisabledInputs();
  check("FIELDSET_UNLOCK_RECOVERED", !proxy(inherited).matches(":disabled"));

  const ranged = field("calendarAuditRange", "2026-03-22", host, {
    min: "2026-03-22",
    max: "2026-03-24",
  });
  open(ranged);
  const allowed = [...popup.querySelectorAll(".cal-days button:not(:disabled)")]
    .map((button) => iso(Number(button.dataset.calendarDay)))
    .sort();
  check(
    "BOUNDS_ARE_INCLUSIVE",
    JSON.stringify(allowed) ===
      JSON.stringify(["2026-03-22", "2026-03-23", "2026-03-24"]),
    { allowed },
  );
  let events = [];
  for (const type of ["input", "change"])
    ranged.addEventListener(type, (event) =>
      events.push({
        type: event.type,
        target: event.target.id,
        value: event.target.value,
      }),
    );
  const before = ranged.value;
  check(
    "INJECTED_OUT_OF_RANGE_REFUSED",
    window.calSelectDay(1) === false &&
      ranged.value === before &&
      events.length === 0,
  );
  check(
    "INJECTED_INVALID_DAY_REFUSED",
    window.calSelectDay(0) === false &&
      window.calSelectDay(32) === false &&
      window.calSelectDay(2.5) === false &&
      ranged.value === before &&
      events.length === 0,
  );
  popup.querySelector('[data-calendar-day="4"]').click();
  await settle();
  check(
    "SELECTION_EXACT_ISO_AND_EVENTS",
    ranged.value === "2026-03-24" &&
      proxy(ranged).value === "۱۴۰۵/۰۱/۰۴" &&
      JSON.stringify(events) ===
        JSON.stringify([
          { type: "input", target: ranged.id, value: "2026-03-24" },
          { type: "change", target: ranged.id, value: "2026-03-24" },
        ]) &&
      !popup.classList.contains("open") &&
      document.activeElement === proxy(ranged),
    { value: ranged.value, events, active: document.activeElement?.id },
  );
  open(ranged);
  ranged.max = "2026-03-22";
  const changedBoundsEvents = events.length;
  check(
    "CHANGED_BOUNDS_RECHECKED_ON_SELECTION",
    window.calSelectDay(3) === false &&
      ranged.value === "2026-03-24" &&
      events.length === changedBoundsEvents,
  );
  ranged.max = "2026-03-24";
  closeShamsiCalendar();
  for (const property of ["disabled", "readOnly"]) {
    open(ranged);
    const snapshot = ranged.value,
      count = events.length;
    ranged[property] = true;
    const result = window.calSelectDay(2);
    check(
      "LOCKED_AFTER_OPEN_" + property,
      result === false &&
        ranged.value === snapshot &&
        events.length === count &&
        !popup.classList.contains("open"),
    );
    ranged[property] = false;
    syncShamsiDisabledInputs();
  }
  const invalidSelected = field("calendarAuditOutside", "2026-03-21", host, {
    min: "2026-03-22",
    max: "2026-03-24",
  });
  open(invalidSelected);
  check(
    "OUTSIDE_SELECTED_DATE_STILL_FOCUSES_USABLE_CONTROL",
    popup.contains(document.activeElement) &&
      !document.activeElement.matches(":disabled"),
    {
      active: document.activeElement?.id,
      disabledSelected: !!popup.querySelector(".selected:disabled"),
    },
  );
  closeShamsiCalendar();

  const esfand = field("calendarAuditEsfand", "2026-03-20");
  open(esfand);
  check(
    "COMMON_ESFAND_HAS_29_DAYS",
    calViewYear === 1404 &&
      calViewMonth === 12 &&
      popup.querySelectorAll("[data-calendar-action=select]").length === 29 &&
      window.calSelectDay(30) === false &&
      esfand.value === "2026-03-20",
  );
  popup.querySelector("[data-calendar-action=next]").click();
  check(
    "NEXT_MONTH_CROSSES_NOWRUZ",
    calViewYear === 1405 && calViewMonth === 1,
  );
  popup.querySelector("[data-calendar-action=prev]").click();
  check(
    "PREVIOUS_MONTH_REVERSES_NOWRUZ",
    calViewYear === 1404 && calViewMonth === 12,
  );
  closeShamsiCalendar();
  esfand.value = "2025-03-20";
  esfand.dispatchEvent(new Event("change", { bubbles: true }));
  open(esfand);
  check(
    "LEAP_ESFAND_HAS_VALID_DAY_30",
    calViewYear === 1403 &&
      calViewMonth === 12 &&
      popup.querySelectorAll("[data-calendar-action=select]").length === 30 &&
      window.calSelectDay(30) === true &&
      esfand.value === "2025-03-20",
  );
  await settle();

  for (const [id, value, direction] of [
    ["LOWER", "0001-01-01", -1],
    ["UPPER", "9999-12-31", 1],
  ]) {
    const extreme = field("calendarAuditExtreme" + id, value),
      expected = gregorianToJalali(...value.split("-").map(Number)),
      selectedEvents = [];
    for (const type of ["input", "change"])
      extreme.addEventListener(type, (event) =>
        selectedEvents.push({ type: event.type, value: event.target.value }),
      );
    open(extreme);
    const selected = popup.querySelector(".selected:not(:disabled)"),
      buttons = [...popup.querySelectorAll("[data-calendar-action=select]")],
      usable = buttons.filter((button) => !button.disabled),
      outside = buttons.filter((button) => {
        const date = iso(Number(button.dataset.calendarDay));
        return (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          date < "0001-01-01" ||
          date > "9999-12-31"
        );
      });
    check(
      "EXTREME_" + id + "_OPENS_CORRECT_MONTH",
      popup.classList.contains("open") &&
        calViewYear === expected[0] &&
        calViewMonth === expected[1] &&
        selected?.dataset.calendarDay === String(expected[2]) &&
        selected === document.activeElement &&
        usable.length > 0,
      {
        value,
        expected,
        view: [calViewYear, calViewMonth],
        selected: selected?.dataset.calendarDay,
      },
    );
    check(
      "EXTREME_" + id + "_DISABLES_OUTSIDE_NATIVE_RANGE",
      outside.length > 0 &&
        outside.every((button) => button.disabled) &&
        usable.every((button) => {
          const date = iso(Number(button.dataset.calendarDay));
          return (
            /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            date >= "0001-01-01" &&
            date <= "9999-12-31"
          );
        }),
      { outside: outside.length, usable: usable.length },
    );
    const view = [calViewYear, calViewMonth].join("-"),
      boundaryNavigation = popup.querySelector(
        '[data-calendar-direction="' + direction + '"]',
      );
    boundaryNavigation.click();
    const rejected = window.calChangeMonth(direction);
    check(
      "EXTREME_" + id + "_NAVIGATION_CANNOT_ESCAPE",
      boundaryNavigation.disabled &&
        rejected === false &&
        [calViewYear, calViewMonth].join("-") === view &&
        extreme.value === value,
      { view, direction, rejected },
    );
    const chosen = window.calSelectDay(expected[2]);
    await settle();
    check(
      "EXTREME_" + id + "_EXACT_SELECTION_AND_EVENTS",
      chosen === true &&
        extreme.value === value &&
        JSON.stringify(selectedEvents) ===
          JSON.stringify([
            { type: "input", value },
            { type: "change", value },
          ]) &&
        !popup.classList.contains("open"),
      { value: extreme.value, selectedEvents },
    );
  }

  for (const [id, min, max, anchor] of [
    ["HISTORICAL", "1950-01-15", "1950-02-10", "1950-02-10"],
    ["FUTURE", "2040-09-10", "2040-10-12", "2040-09-10"],
    ["ONLY_MIN", "2040-09-10", "", "2040-09-10"],
    ["ONLY_MAX", "", "1950-02-10", "1950-02-10"],
  ]) {
    const empty = field("calendarAuditEmpty" + id, "", host, { min, max }),
      expected = gregorianToJalali(...anchor.split("-").map(Number));
    open(empty);
    const usable = [
        ...popup.querySelectorAll(".cal-days button:not(:disabled)"),
      ],
      focused = document.activeElement;
    check(
      "EMPTY_BOUNDED_" + id + "_OPENS_AT_ALLOWED_MONTH",
      calViewYear === expected[0] &&
        calViewMonth === expected[1] &&
        usable.length > 0 &&
        usable.includes(focused) &&
        empty.value === "" &&
        proxy(empty).value === "" &&
        usable.every((button) => {
          const date = iso(Number(button.dataset.calendarDay));
          return (!min || date >= min) && (!max || date <= max);
        }),
      {
        expected,
        view: [calViewYear, calViewMonth],
        usable: usable.length,
        focused: focused?.dataset.calendarDay,
      },
    );
    closeShamsiCalendar();
  }

  const monthBounds = field("calendarAuditMonthBounds", "2026-03-22", host, {
    min: "2026-03-21",
    max: "2026-04-25",
  });
  open(monthBounds);
  for (const [id, direction, month] of [
    ["LAST", "next", 2],
    ["FIRST", "prev", 1],
  ]) {
    const navigation = popup.querySelector(
      '[data-calendar-action="' + direction + '"]',
    );
    navigation.focus();
    navigation.click();
    const active = document.activeElement;
    check(
      "BOUNDARY_MONTH_" + id + "_RETAINS_ENABLED_FOCUS",
      calViewYear === 1405 &&
        calViewMonth === month &&
        popup.querySelector('[data-calendar-action="' + direction + '"]')
          .disabled &&
        popup.contains(active) &&
        !active.matches(":disabled"),
      {
        view: [calViewYear, calViewMonth],
        active: active?.getAttribute("data-calendar-action"),
        activeDay: active?.dataset.calendarDay,
      },
    );
  }
  closeShamsiCalendar();

  for (const value of ["0001-01-01", "0099-01-01", "0100-01-01"]) {
    const early = field("calendarAuditEarly" + value.slice(0, 4), value);
    open(early);
    const parts = jalaliToGregorian(calViewYear, calViewMonth, 1),
      date = new Date(0);
    date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
    const expectedLeading = (date.getUTCDay() + 1) % 7,
      leading = popup.querySelectorAll(".cal-days .empty").length;
    check(
      "UTC_WEEKDAY_IN_EARLY_YEAR_" + value.slice(0, 4),
      expectedLeading === leading,
      { parts, expectedLeading, leading },
    );
    closeShamsiCalendar();
  }

  input.value = "2026-03-21";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  const second = field("calendarAuditSecond");
  events = [];
  input.addEventListener("input", () => proxy(second).click(), { once: true });
  for (const type of ["input", "change"])
    input.addEventListener(type, (event) =>
      events.push(event.target.id + ":" + event.type),
    );
  open(input);
  const wantedDay = Number(
    popup.querySelector(".cal-days button:not(:disabled)").dataset.calendarDay,
  );
  window.calSelectDay(wantedDay);
  await settle();
  check(
    "REENTRANT_INPUT_KEEPS_ORIGINAL_EVENT_TARGET",
    JSON.stringify(events) ===
      JSON.stringify([input.id + ":input", input.id + ":change"]),
    { events },
  );
  check(
    "REENTRANT_NEW_PICKER_RETAINS_FOCUS",
    popup.classList.contains("open") &&
      proxy(second).getAttribute("aria-expanded") === "true" &&
      popup.contains(document.activeElement),
    {
      active: document.activeElement?.id,
      popupOpen: popup.classList.contains("open"),
    },
  );
  closeShamsiCalendar();

  const dialog = document.createElement("dialog");
  host.append(dialog);
  const inDialog = field("calendarAuditDialog", "2026-03-21", dialog);
  dialog.showModal();
  open(inDialog);
  check(
    "NATIVE_DIALOG_HOSTS_VISIBLE_PICKER",
    dialog.contains(popup) &&
      popup.classList.contains("open") &&
      popup.getClientRects().length > 0 &&
      popup.contains(document.activeElement),
  );
  dialog.close();
  await settle();
  check(
    "NATIVE_DIALOG_CLOSE_CLEARS_POPUP_STATE",
    !popup.classList.contains("open") &&
      proxy(inDialog).getAttribute("aria-expanded") === "false",
    {
      open: popup.classList.contains("open"),
      expanded: proxy(inDialog).getAttribute("aria-expanded"),
    },
  );
  document.body.append(popup);
  dialog.remove();
  closeShamsiCalendar();

  const removable = document.createElement("div");
  host.append(removable);
  const removedDate = field("calendarAuditRemoved", "2026-03-21", removable);
  open(removedDate);
  removable.remove();
  await settle();
  check(
    "REMOVED_OWNER_CANNOT_LEAVE_OPEN_POPUP",
    !popup.classList.contains("open"),
    {
      open: popup.classList.contains("open"),
      ownerConnected: removedDate.isConnected,
    },
  );
  closeShamsiCalendar();
  showModal(
    "ممیزی تقویم",
    '<input id="calendarAuditModal" type="date" value="2026-03-21">',
  );
  initShamsiPickers();
  document.getElementById("calendarAuditModal-shamsi").click();
  check(
    "APPLICATION_MODAL_HOSTS_PICKER",
    !!popup.closest("#modal") && popup.classList.contains("open"),
  );
  closeModal();
  await settle();
  check(
    "APPLICATION_MODAL_CLOSE_CLEARS_PICKER",
    !popup.classList.contains("open"),
  );
  document.body.append(popup);
  open(input);
  check(
    "PICKER_RECOVERS_AFTER_MODAL_CLOSE",
    popup.isConnected && popup.classList.contains("open"),
  );
  closeShamsiCalendar();
  check("SCHOOL_DATA_UNCHANGED", JSON.stringify(db) === saved);
  return cases;
}

async function run({ cdp, evaluate, cases, delay, root }) {
  const screenshotDirectory = path.join(root, ".cache/calendar-audit");
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  const add = (id, pass, observed = {}) =>
      cases.push({ id: "CALENDAR_" + id, name: id, pass: !!pass, observed }),
    call = (fn, ...args) =>
      evaluate("(" + fn.toString() + ")(..." + JSON.stringify(args) + ")"),
    key = async (key, code, modifiers = 0) => {
      await cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        code,
        modifiers,
      });
      await cdp("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code,
        modifiers,
      });
      await delay(60);
    };
  await require("./browser-ready.cjs").waitReady({ evaluate, delay });
  try {
    cases.push(...(await call(calendarChecks)));
    await evaluate(`(() => {
      showModal("ممیزی صفحه کلید", '<input id="calendarAuditKeyboard" type="date" value="2026-03-21">');
      initShamsiPickers();
      document.getElementById("calendarAuditKeyboard-shamsi").focus();
    })()`);
    await key("Enter", "Enter");
    add(
      "KEYBOARD_ENTER_OPENS",
      await evaluate(
        'calPopup.classList.contains("open") && calPopup.contains(document.activeElement)',
      ),
    );
    await evaluate('calPopup.querySelector(".calendar-close").focus()');
    await key("Tab", "Tab");
    add(
      "TAB_WRAPS_WITHIN_PICKER",
      await evaluate(
        'document.activeElement === calPopup.querySelector("button:not(:disabled)")',
      ),
    );
    await key("Tab", "Tab", 8);
    add(
      "SHIFT_TAB_WRAPS_WITHIN_PICKER",
      await evaluate(
        'document.activeElement === calPopup.querySelector(".calendar-close")',
      ),
    );
    await key("Escape", "Escape");
    add(
      "ESCAPE_CLOSES_ONLY_NESTED_PICKER",
      await evaluate(
        '!calPopup.classList.contains("open") && !document.getElementById("modal").classList.contains("hidden") && document.activeElement.id === "calendarAuditKeyboard-shamsi"',
      ),
    );
    await key(" ", "Space");
    add(
      "KEYBOARD_SPACE_OPENS",
      await evaluate('calPopup.classList.contains("open")'),
    );
    await key("Escape", "Escape");
    await key("ArrowDown", "ArrowDown");
    add(
      "KEYBOARD_DOWN_OPENS",
      await evaluate('calPopup.classList.contains("open")'),
    );
    await evaluate("closeModal();document.body.append(calPopup)");

    const geometry = async () =>
      call(() => {
        const popup = document.getElementById("calPopup"),
          rect = popup.getBoundingClientRect(),
          view = window.visualViewport,
          left = view?.offsetLeft || 0,
          top = view?.offsetTop || 0,
          width = view?.width || innerWidth,
          height = view?.height || innerHeight;
        return {
          open: popup.classList.contains("open"),
          fits:
            rect.left >= left - 1 &&
            rect.top >= top - 1 &&
            rect.right <= left + width + 1 &&
            rect.bottom <= top + height + 1,
          noHorizontalScroll: popup.scrollWidth <= popup.clientWidth + 1,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom,
          },
          viewport: { left, top, width, height },
          touchHeight: Math.min(
            ...[
              ...popup.querySelectorAll(
                ".cal-header button,.cal-days button:not(.empty),.calendar-close",
              ),
            ].map((button) => button.getBoundingClientRect().height),
          ),
        };
      });
    for (const [width, height] of [
      [1440, 900],
      [768, 720],
      [390, 844],
      [320, 568],
      [390, 240],
    ]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp("Emulation.setTouchEmulationEnabled", {
        enabled: width <= 768,
      });
      await delay(120);
      await evaluate(
        'closeShamsiCalendar();document.getElementById("calendarAuditDate-shamsi").click()',
      );
      const initial = await geometry();
      add(
        "VIEWPORT_" + width + "_" + height,
        initial.open &&
          initial.fits &&
          initial.noHorizontalScroll &&
          initial.touchHeight >= 43,
        initial,
      );
      await evaluate(
        'calPopup.querySelector("[data-calendar-action=next]").click()',
      );
      const changed = await geometry();
      add(
        "MONTH_NAVIGATION_FITS_" + width + "_" + height,
        changed.open && changed.fits && changed.noHorizontalScroll,
        changed,
      );
      const sixRows = await evaluate(`(() => {
        const input = document.getElementById("calendarAuditDate");
        input.value = "2030-03-20";
        input.dispatchEvent(new Event("change", {bubbles:true}));
        closeShamsiCalendar();
        input.nextElementSibling.click();
        const before = {
          year: calViewYear, month: calViewMonth,
          cells: calPopup.querySelectorAll(".cal-days button").length,
        };
        calPopup.querySelector("[data-calendar-action=next]").click();
        return {before, after: {
          year: calViewYear, month: calViewMonth,
          cells: calPopup.querySelectorAll(".cal-days button").length,
        }};
      })()`);
      const expanded = await geometry();
      add(
        "NOWRUZ_SIX_ROWS_CONTAINED_" + width + "_" + height,
        sixRows.before.year === 1408 &&
          sixRows.before.month === 12 &&
          sixRows.before.cells <= 35 &&
          sixRows.after.year === 1409 &&
          sixRows.after.month === 1 &&
          sixRows.after.cells > 35 &&
          expanded.open &&
          expanded.fits &&
          expanded.noHorizontalScroll,
        { ...sixRows, geometry: expanded },
      );
      const screenshot = await cdp("Page.captureScreenshot", {
        format: "png",
      });
      fs.writeFileSync(
        path.join(screenshotDirectory, `calendar-${width}x${height}.png`),
        Buffer.from(screenshot.data, "base64"),
      );
    }
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(100);
    await evaluate(
      'closeShamsiCalendar();document.getElementById("calendarAuditDate-shamsi").click()',
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 320,
      height: 240,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(180);
    const resized = await geometry();
    add(
      "OPEN_PICKER_REPOSITIONS_ON_RESIZE",
      resized.open && resized.fits && resized.noHorizontalScroll,
      resized,
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await delay(120);
    await evaluate(
      'closeShamsiCalendar();document.getElementById("calendarAuditDate-shamsi").click()',
    );
    const zoomed = await geometry();
    add(
      "ZOOMED_VISUAL_VIEWPORT_CONTAINMENT",
      zoomed.open &&
        zoomed.fits &&
        zoomed.noHorizontalScroll &&
        zoomed.viewport.width < 390,
      zoomed,
    );
    await cdp("Input.synthesizeScrollGesture", {
      x: 170,
      y: 350,
      xDistance: -50,
      yDistance: -50,
      gestureSourceType: "touch",
      preventFling: true,
    });
    await delay(120);
    const panned = await geometry();
    add(
      "ZOOMED_PAN_REPOSITIONS_PICKER",
      panned.open && panned.fits && panned.noHorizontalScroll,
      panned,
    );
  } finally {
    await cdp("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
    await cdp("Emulation.clearDeviceMetricsOverride");
    const cleanup = await evaluate("globalThis.__calendarAudit?.cleanup()");
    add(
      "CLEANUP_PRESERVES_DATA",
      !!cleanup && Object.values(cleanup).every(Boolean),
      cleanup,
    );
  }
}

module.exports = run;
if (require.main === module)
  main({
    stage: "calendar-real-browser-lifecycle-and-viewports",
    runExtra: run,
  }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
