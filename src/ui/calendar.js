const MONTHS_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
const WEEKDAYS_FA = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
// Shared by both entries; the picker must not require the teacher runtime.
const calendarFaNum = (value) =>
  String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

function setShamsiPickerDisabled(control, disabled) {
  // Preserve the teacher's save/lock coordination when that adapter is present.
  if (typeof setControlDisabled === "function")
    setControlDisabled(control, disabled);
  else control.disabled = Boolean(disabled);
}

let calTargetInput = null;
let calViewYear = 1403,
  calViewMonth = 1,
  calSelectedJalali = null;
const calPopup = document.getElementById("calPopup");
let calProxySequence = 0,
  calOwnerObserver = null;

function calendarValidISO(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return year > 0 && date.toISOString().slice(0, 10) === value;
}

function syncShamsiInput(input) {
  const proxy = input.nextElementSibling;
  if (!proxy?.dataset.gregorianTarget) return;
  if (input.dataset.calendarInvalid && input.validity?.valid) {
    delete input.dataset.calendarInvalid;
    input.removeAttribute("aria-invalid");
  }
  if (calendarValidISO(input.value)) {
    const parts = input.value.split("-").map(Number);
    const [jy, jm, jd] = gregorianToJalali(...parts);
    proxy.value = `${calendarFaNum(jy)}/${calendarFaNum(String(jm).padStart(2, "0"))}/${calendarFaNum(String(jd).padStart(2, "0"))}`;
    Object.assign(proxy.dataset, { jy, jm, jd });
  } else {
    proxy.value = "";
    for (const key of ["jy", "jm", "jd"]) delete proxy.dataset[key];
  }
  for (const name of ["aria-describedby", "aria-invalid"])
    if (input.hasAttribute(name))
      proxy.setAttribute(name, input.getAttribute(name));
    else proxy.removeAttribute(name);
  proxy.setAttribute("aria-required", String(Boolean(input.required)));
}

function calendarTargetAvailable(input) {
  return Boolean(
    input &&
    input.isConnected !== false &&
    !input.matches?.(":disabled") &&
    !input.readOnly &&
    !input.closest?.("[inert],[hidden],.hidden,dialog:not([open])"),
  );
}

function positionShamsiCalendar() {
  if (!calPopup.classList.contains("open")) return;
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  const left = viewport?.offsetLeft || 0;
  const top = viewport?.offsetTop || 0;
  calPopup.style.position = "fixed";
  calPopup.style.maxWidth = Math.max(0, width - 24) + "px";
  calPopup.style.maxHeight = Math.max(0, height - 24) + "px";
  calPopup.style.left =
    left + Math.max(12, (width - calPopup.offsetWidth) / 2) + "px";
  calPopup.style.top =
    top + Math.max(12, (height - calPopup.offsetHeight) / 2) + "px";
}

function focusShamsiCalendar(preferred) {
  (
    (preferred && calPopup.querySelector(preferred)) ||
    calPopup.querySelector(".selected:not(:disabled)") ||
    calPopup.querySelector(".today:not(:disabled)") ||
    calPopup.querySelector(".cal-days button:not(:disabled)") ||
    calPopup.querySelector(".calendar-close")
  )?.focus({ preventScroll: true });
}

window.addEventListener?.("resize", positionShamsiCalendar);
window.visualViewport?.addEventListener("resize", positionShamsiCalendar);
window.visualViewport?.addEventListener("scroll", positionShamsiCalendar);

function closeShamsiCalendar(restoreFocus = false) {
  const closedInput = calTargetInput;
  calOwnerObserver?.disconnect();
  calOwnerObserver = null;
  calPopup.classList.remove("open");
  const proxy = calTargetInput?.nextElementSibling;
  if (proxy?.dataset.gregorianTarget)
    proxy.setAttribute("aria-expanded", "false");
  if (restoreFocus)
    requestAnimationFrame(() => {
      if (calPopup.classList.contains("open") || calTargetInput !== closedInput)
        return;
      const target = proxy?.isConnected
        ? proxy
        : proxy?.id
          ? document.getElementById(proxy.id)
          : null;
      if (
        target &&
        !target.matches(":disabled") &&
        !target.closest("[inert],[hidden],.hidden,dialog:not([open])")
      )
        target.focus({ preventScroll: true });
    });
  // Keep the shared popup alive when its owning form/dialog is replaced.
  if (calPopup.parentElement !== document.body) document.body.append(calPopup);
}
// The calendar is a nested popup: Escape closes it before its parent dialog.
document.addEventListener(
  "keydown",
  (event) => {
    if (!calPopup.classList.contains("open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeShamsiCalendar(true);
    } else if (event.key === "Tab") {
      const nodes = [
        ...calPopup.querySelectorAll("button:not(:disabled)"),
      ].filter((element) => element.getClientRects().length);
      if (!nodes.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !nodes.includes(document.activeElement))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !nodes.includes(document.activeElement))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        first.focus();
      } else event.stopImmediatePropagation();
    }
  },
  true,
);

function syncShamsiDisabledInputs() {
  for (const input of document.querySelectorAll(
    'input[type="date"][data-shamsi-applied]',
  )) {
    const proxy = input.nextElementSibling;
    if (proxy?.dataset.gregorianTarget)
      setShamsiPickerDisabled(
        proxy,
        input.matches(":disabled") || input.readOnly,
      );
    syncShamsiInput(input);
  }
}

function initShamsiPickers() {
  const dateInputs = document.querySelectorAll('input[type="date"]');
  dateInputs.forEach((input) => {
    if (input.dataset.shamsiApplied) {
      syncShamsiInput(input);
      const proxy = input.nextElementSibling;
      if (proxy?.dataset.gregorianTarget)
        setShamsiPickerDisabled(
          proxy,
          input.matches(":disabled") || input.readOnly,
        );
      return;
    }
    const labels = [...(input.labels || [])];
    input.dataset.shamsiApplied = "1";
    input.style.display = "none";
    const shamsiInput = document.createElement("input");
    shamsiInput.type = "text";
    shamsiInput.className = input.className;
    shamsiInput.style.cssText = input.style.cssText;
    shamsiInput.style.display = "";
    shamsiInput.placeholder = "انتخاب تاریخ";
    shamsiInput.readOnly = true;
    setShamsiPickerDisabled(
      shamsiInput,
      input.matches(":disabled") || input.readOnly,
    );
    const proxyBaseId = input.id ? input.id + "-shamsi" : "shamsi-date";
    shamsiInput.id = proxyBaseId;
    while (document.getElementById(shamsiInput.id))
      shamsiInput.id = proxyBaseId + "-" + ++calProxySequence;
    shamsiInput.setAttribute(
      "aria-label",
      input.getAttribute("aria-label") ||
        labels.map((label) => label.textContent.trim()).join(" ") ||
        input.getAttribute("title") ||
        "انتخاب تاریخ",
    );
    shamsiInput.setAttribute("aria-haspopup", "dialog");
    shamsiInput.setAttribute("aria-controls", "calPopup");
    shamsiInput.setAttribute("aria-expanded", "false");
    shamsiInput.dataset.gregorianTarget = "true";
    input.parentNode.insertBefore(shamsiInput, input.nextSibling);
    for (const label of labels) label.htmlFor = shamsiInput.id;
    syncShamsiInput(input);
    for (const type of ["input", "change"])
      input.addEventListener(type, () => syncShamsiInput(input));
    input.form?.addEventListener("reset", () =>
      queueMicrotask(() => {
        if (input.isConnected) syncShamsiInput(input);
      }),
    );
    input.addEventListener("invalid", (event) => {
      event.preventDefault();
      if (!calendarTargetAvailable(input)) return;
      input.dataset.calendarInvalid = "true";
      input.setAttribute("aria-invalid", "true");
      shamsiInput.focus({ preventScroll: true });
      shamsiInput.click();
    });
    shamsiInput.addEventListener("keydown", (event) => {
      if (["Enter", " ", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        shamsiInput.click();
      }
    });
    shamsiInput.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!calendarTargetAvailable(input)) return;
      closeShamsiCalendar();
      syncShamsiInput(input);
      (
        input.closest("dialog[open]") ||
        (input.closest("#modal")
          ? document.querySelector("#modal .modal-dialog")
          : document.body)
      ).append(calPopup);
      calPopup.setAttribute("role", "dialog");
      calPopup.setAttribute("aria-label", "انتخاب تاریخ شمسی");
      shamsiInput.setAttribute("aria-expanded", "true");
      calTargetInput = input;
      if (calendarValidISO(input.value)) {
        calSelectedJalali = [
          +shamsiInput.dataset.jy,
          +shamsiInput.dataset.jm,
          +shamsiInput.dataset.jd,
        ];
        calViewYear = calSelectedJalali[0];
        calViewMonth = calSelectedJalali[1];
      } else {
        calSelectedJalali = null;
        const t = new Date();
        const [tjy, tjm] = gregorianToJalali(
          t.getFullYear(),
          t.getMonth() + 1,
          t.getDate(),
        );
        calViewYear = tjy;
        calViewMonth = tjm;
      }
      // Start inside the allowed interval, including an empty historical field.
      let anchor = calendarISODate(
        ...jalaliToGregorian(calViewYear, calViewMonth, 1),
      );
      if (anchor < "0001-01-01") anchor = "0001-01-01";
      if (anchor > "9999-12-31") anchor = "9999-12-31";
      if (calendarValidISO(input.min) && anchor < input.min) anchor = input.min;
      if (calendarValidISO(input.max) && anchor > input.max) anchor = input.max;
      [calViewYear, calViewMonth] = gregorianToJalali(
        ...anchor.split("-").map(Number),
      );
      calPopup.classList.add("open");
      renderShamsiCalendar(shamsiInput);
      positionShamsiCalendar();
      focusShamsiCalendar();
      if (typeof MutationObserver === "function") {
        calOwnerObserver = new MutationObserver(() => {
          if (!calendarTargetAvailable(input)) closeShamsiCalendar();
        });
        calOwnerObserver.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: [
            "class",
            "hidden",
            "inert",
            "open",
            "disabled",
            "readonly",
          ],
        });
      }
    });
  });
}

function calendarISODate(gy, gm, gd) {
  return (
    String(gy).padStart(4, "0") +
    "-" +
    String(gm).padStart(2, "0") +
    "-" +
    String(gd).padStart(2, "0")
  );
}
function calendarDateWithinBounds(input, isoDate) {
  return (
    calendarValidISO(isoDate) &&
    (!calendarValidISO(input?.min) || isoDate >= input.min) &&
    (!calendarValidISO(input?.max) || isoDate <= input.max) &&
    (!input?.dataset?.sessionCalendar ||
      (typeof window.sessionCalendarDateAllowed === "function" &&
        window.sessionCalendarDateAllowed(input, isoDate)))
  );
}

function calendarDateFromParts(parts) {
  return calendarUTCDate(...parts);
}

function calendarAdjacentMonth(delta) {
  const month = calViewMonth + delta;
  return month === 0
    ? [calViewYear - 1, 12]
    : month === 13
      ? [calViewYear + 1, 1]
      : [calViewYear, month];
}

function calendarMonthAvailable(year, month) {
  try {
    const start = calendarDateFromParts(jalaliToGregorian(year, month, 1));
    const next = calendarDateFromParts(
      jalaliToGregorian(
        month === 12 ? year + 1 : year,
        month === 12 ? 1 : month + 1,
        1,
      ),
    );
    const lower = calendarValidISO(calTargetInput?.min)
      ? calTargetInput.min
      : "0001-01-01";
    const upper = calendarValidISO(calTargetInput?.max)
      ? calTargetInput.max
      : "9999-12-31";
    return (
      lower <= upper &&
      start.getTime() <=
        calendarDateFromParts(upper.split("-").map(Number)).getTime() &&
      next.getTime() >
        calendarDateFromParts(lower.split("-").map(Number)).getTime()
    );
  } catch {
    return false;
  }
}

function renderShamsiCalendar(shamsiInput) {
  const t = new Date();
  const [tjy, tjm, tjd] = gregorianToJalali(
    t.getFullYear(),
    t.getMonth() + 1,
    t.getDate(),
  );
  const daysCount = (function (jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    const a = jalaliToGregorian(jy, 1, 1),
      b = jalaliToGregorian(jy + 1, 1, 1);
    return Math.round(
      (calendarDateFromParts(b).getTime() -
        calendarDateFromParts(a).getTime()) /
        86400000,
    ) === 366
      ? 30
      : 29;
  })(calViewYear, calViewMonth);
  const [gy, gm, gd] = jalaliToGregorian(calViewYear, calViewMonth, 1);
  const firstDay = (calendarDateFromParts([gy, gm, gd]).getUTCDay() + 1) % 7;
  const previousDisabled = !calendarMonthAvailable(
    ...calendarAdjacentMonth(-1),
  );
  const nextDisabled = !calendarMonthAvailable(...calendarAdjacentMonth(1));
  let h = "";
  h += `<div class="cal-header">
    <button type="button" ${previousDisabled ? "disabled" : ""} data-calendar-action="prev" title="ماه قبل" aria-label="ماه قبل" data-calendar-direction="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg></button>
    <div class="cal-title" aria-live="polite" aria-atomic="true">${MONTHS_FA[calViewMonth - 1]} ${calendarFaNum(calViewYear)}</div>
    <button type="button" ${nextDisabled ? "disabled" : ""} data-calendar-action="next" title="ماه بعد" aria-label="ماه بعد" data-calendar-direction="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m15 6-6 6 6 6"/></svg></button>
  </div>`;
  h += `<div class="cal-weekdays">`;
  WEEKDAYS_FA.forEach((d) => (h += `<div>${d}</div>`));
  h += `</div>`;
  h += `<div class="cal-days"${calTargetInput?.dataset?.sessionCalendar ? ' data-session-calendar="1"' : ""}>`;
  for (let i = 0; i < firstDay; i++)
    h += `<button class="empty" disabled tabindex="-1" aria-hidden="true"></button>`;
  for (let d = 1; d <= daysCount; d++) {
    let cls = "";
    if (calViewYear === tjy && calViewMonth === tjm && d === tjd) cls = "today";
    if (
      calSelectedJalali &&
      calSelectedJalali[0] === calViewYear &&
      calSelectedJalali[1] === calViewMonth &&
      calSelectedJalali[2] === d
    )
      cls = "selected";
    const nativeDate = calendarISODate(
      ...jalaliToGregorian(calViewYear, calViewMonth, d),
    );
    const disabled = !calendarDateWithinBounds(calTargetInput, nativeDate);
    h += `<button type="button" ${disabled ? `disabled title="${calTargetInput?.dataset?.sessionCalendar ? "خارج از برنامهٔ این کلاس و درس یا بازهٔ مجاز" : "خارج از بازهٔ مجاز"}"` : ""} class="${cls}" aria-label="${calendarFaNum(d)} ${MONTHS_FA[calViewMonth - 1]} ${calendarFaNum(calViewYear)}" aria-pressed="${cls === "selected"}" data-calendar-action="select" data-calendar-day="${d}">${calendarFaNum(d)}</button>`;
  }
  h += `</div>`;
  if (calTargetInput?.dataset?.sessionCalendar)
    h +=
      '<div class="cal-policy-note">روزهای برنامهٔ این کلاس و درس یا جلسات ثبت‌شده فعال‌اند.</div>';
  h += `<div class="cal-footer">امروز: ${calendarFaNum(tjy)}/${calendarFaNum(String(tjm).padStart(2, "0"))}/${calendarFaNum(String(tjd).padStart(2, "0"))}</div>`;
  h += `<button type="button" class="ghost calendar-close" data-calendar-action="close">بستن تقویم</button>`;
  calPopup.innerHTML = h;
}

window.calChangeMonth = function (delta) {
  if (delta !== -1 && delta !== 1) return false;
  const adjacent = calendarAdjacentMonth(delta);
  if (!calendarMonthAvailable(...adjacent)) return false;
  [calViewYear, calViewMonth] = adjacent;
  renderShamsiCalendar(calTargetInput);
  positionShamsiCalendar();
  focusShamsiCalendar(
    '[data-calendar-direction="' +
      (delta < 0 ? "-1" : "1") +
      '"]:not(:disabled)',
  );
};

window.calSelectDay = function (d) {
  const input = calTargetInput;
  if (
    !calPopup.classList.contains("open") ||
    !input ||
    !calendarTargetAvailable(input)
  ) {
    closeShamsiCalendar(true);
    return false;
  }
  if (!Number.isInteger(d) || d < 1 || d > 31) return false;
  let gy, gm, gd, actual;
  try {
    [gy, gm, gd] = jalaliToGregorian(calViewYear, calViewMonth, d);
    actual = gregorianToJalali(gy, gm, gd);
  } catch {
    return false;
  }
  if (
    actual[0] !== calViewYear ||
    actual[1] !== calViewMonth ||
    actual[2] !== d
  )
    return false;
  const gStr = calendarISODate(gy, gm, gd);
  if (!calendarDateWithinBounds(input, gStr)) return false;
  const shamsiStr =
    calendarFaNum(calViewYear) +
    "/" +
    calendarFaNum(String(calViewMonth).padStart(2, "0")) +
    "/" +
    calendarFaNum(String(d).padStart(2, "0"));
  input.value = gStr;
  input.dataset.jy = calViewYear;
  input.dataset.jm = calViewMonth;
  input.dataset.jd = d;
  const next = input.nextElementSibling;
  if (next?.dataset.gregorianTarget) {
    next.value = shamsiStr;
    next.dataset.jy = calViewYear;
    next.dataset.jm = calViewMonth;
    next.dataset.jd = d;
  }
  closeShamsiCalendar(true);
  // Both events belong to this input even if a listener opens another picker.
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

document.addEventListener("click", function (e) {
  if (
    calPopup &&
    !calPopup.contains(e.target) &&
    !e.target.closest("[data-gregorian-target]")
  ) {
    closeShamsiCalendar();
  }
});
// ==================== پایان تقویم شمسی ====================
