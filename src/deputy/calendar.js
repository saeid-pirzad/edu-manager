// Deputy adapter for the shared teacher calendar. ISO remains the file/state contract.
function validCalendarISO(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31)
    return false;
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() + 1 === month &&
    normalized.getUTCDate() === day
  );
}

function jalaliText(iso) {
  if (!validCalendarISO(iso)) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const [jy, jm, jd] = gregorianToJalali(year, month, day);
  return (
    String(jy) +
    "/" +
    String(jm).padStart(2, "0") +
    "/" +
    String(jd).padStart(2, "0")
  ).replace(/\d/g, (char) => "۰۱۲۳۴۵۶۷۸۹"[Number(char)]);
}

function reportDateError() {
  return (
    state.dateErrors.from ||
    state.dateErrors.to ||
    (state.from && state.to && state.from > state.to
      ? "تاریخ شروع نباید بعد از تاریخ پایان باشد."
      : "")
  );
}

function setReportDate(fieldName, iso) {
  if (!["from", "to"].includes(fieldName)) return;
  const valid = iso === "" || validCalendarISO(iso);
  state[fieldName] = valid ? iso : "";
  state.dateErrors[fieldName] = valid
    ? ""
    : "تاریخ انتخاب‌شده معتبر نیست؛ تاریخ را دوباره از تقویم انتخاب کنید.";
}

function dateFilter(fieldName, title) {
  const id = fieldName === "from" ? "deputyFrom" : "deputyTo";
  const error = state.dateErrors[fieldName];
  return (
    '<label class="ed-field ed-date-field"><span>' +
    esc(title) +
    '</span><span class="ed-date-control"><input type="date" hidden id="' +
    id +
    '" value="' +
    esc(state[fieldName]) +
    '" aria-label="' +
    esc(title) +
    '" aria-invalid="' +
    Boolean(error) +
    '" aria-describedby="' +
    id +
    'Hint"><button type="button" class="ed-button ed-secondary" data-deputy-action="calendar-clear" data-field="' +
    fieldName +
    '" aria-label="پاک‌کردن ' +
    esc(title) +
    '" title="پاک‌کردن تاریخ">' +
    icon("close") +
    '</button></span><small id="' +
    id +
    'Hint" class="' +
    (error ? "ed-date-error" : "") +
    '">' +
    esc(error || "شمسی · خالی: بدون محدودیت") +
    "</small></label>"
  );
}

function syncDeputyDateProxy(fieldName) {
  const id = fieldName === "from" ? "deputyFrom" : "deputyTo";
  const native = document.getElementById(id);
  const proxy = document.getElementById(id + "-shamsi");
  if (native) native.value = state[fieldName];
  if (!proxy) return;
  proxy.value = jalaliText(state[fieldName]);
  proxy.setAttribute("aria-describedby", id + "Hint");
  proxy.setAttribute(
    "aria-invalid",
    String(Boolean(state.dateErrors[fieldName] || reportDateError())),
  );
  if (state[fieldName]) {
    const [year, month, day] = state[fieldName].split("-").map(Number);
    const [jy, jm, jd] = gregorianToJalali(year, month, day);
    Object.assign(proxy.dataset, {
      jy: String(jy),
      jm: String(jm),
      jd: String(jd),
    });
  } else
    for (const control of [native, proxy])
      for (const key of ["jy", "jm", "jd"]) {
        if (control?.dataset) delete control.dataset[key];
      }
}
