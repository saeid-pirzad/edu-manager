// Private deputy bundle fragment; assembled inside the deputy scope.

function navigation(bottom = false) {
  const name = bottom ? "deputyBottomNav" : "deputyDesktopNav";
  return (
    '<nav id="' +
    name +
    '" class="' +
    (bottom ? "ed-bottom-nav" : "ed-tabs") +
    '" aria-label="' +
    (bottom ? "دسترسی اصلی کارتابل" : "بخش‌های کارتابل") +
    '">' +
    [
      ["receive", "upload", "دریافت اطلاعات"],
      ["reports", "report", "گزارش‌ها"],
      ["followups", "attendance", "پیگیری‌ها"],
    ]
      .map(
        ([tab, symbol, text]) =>
          '<button type="button" id="' +
          name +
          "-" +
          tab +
          '" data-deputy-tab="' +
          tab +
          '" ' +
          (state.tab === tab ? 'aria-current="page" ' : "") +
          (state.busy || !state.ready ? "disabled " : "") +
          ">" +
          icon(symbol) +
          "<span>" +
          text +
          "</span></button>",
      )
      .join("") +
    "</nav>"
  );
}

function render(focusId = "") {
  if (!host) return;
  root.closeShamsiCalendar(false);
  normalizeSelection();
  const body = state.ready
    ? state.tab === "receive"
      ? receive()
      : state.tab === "reports"
        ? reports()
        : followups()
    : empty(
        "در حال آماده‌سازی کارتابل",
        "بانک اطلاعاتی معاون مستقل از اطلاعات دبیر باز می‌شود.",
      );
  host.innerHTML =
    '<header class="ed-header"><div class="ed-brand"><span class="ed-brand-mark" aria-hidden="true">' +
    icon("school") +
    '</span><div><h1>کلاس‌یار</h1><p>کارتابل معاون</p></div></div><div class="ed-header-actions">' +
    action(
      "refresh",
      "بازخوانی کارتابل",
      (state.ready ? "" : "disabled ") +
        ' aria-label="بازخوانی اطلاعات ذخیره‌شده در همین مرورگر" title="بازخوانی کارتابل؛ برای دریافت تغییرات دبیر، فایل جدید را وارد کنید"',
      "ed-secondary ed-header-refresh",
    ) +
    '</div></header><div class="ed-status ' +
    (state.error ? "ed-status-error" : "") +
    '" role="status" aria-live="polite" id="deputyMessage">' +
    esc(state.status) +
    "</div>" +
    (state.stale
      ? '<p class="ed-warning">اطلاعات ممکن است در پنجرهٔ دیگری تغییر کرده باشد؛ برای مشاهدهٔ آخرین نسخه، بازخوانی کنید.</p>'
      : "") +
    '<fieldset class="ed-workspace" ' +
    (state.busy || !state.ready ? "disabled" : "") +
    ' aria-busy="' +
    state.busy +
    '"><legend class="ed-sr-only">کارتابل معاون</legend>' +
    navigation() +
    '<div class="ed-content">' +
    body +
    "</div></fieldset>" +
    navigation(true) +
    '<footer class="ed-footer">' +
    icon("shield") +
    "<span>فقط مشاهده و پیگیری · اطلاعات آموزشی دبیر تغییر نمی‌کند.</span></footer>";
  const externalStatus = document.getElementById("deputyStatus");
  if (externalStatus) externalStatus.textContent = "";
  root.initShamsiPickers();
  root.syncShamsiDisabledInputs();
  for (const fieldName of ["from", "to"]) syncDeputyDateProxy(fieldName);
  if (focusId) document.getElementById(focusId)?.focus();
}

function updateViewport() {
  const editing = document.activeElement?.matches(
    'input:not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]',
  );
  const keyboard =
    editing &&
    root.visualViewport &&
    root.innerHeight - root.visualViewport.height > 120;
  document.body.classList.toggle("ed-keyboard-open", Boolean(keyboard));
}
async function reload() {
  const rows = await store.list();
  const notes = await store.followups();
  const safetyInfo = await store.safetyBackupInfo();
  state.rows = rows;
  state.followups = notes;
  state.safetyInfo = safetyInfo;
  state.stale = false;
  normalizeSelection();
}

async function run(task, pending, focusId = "") {
  if (state.busy) return;
  state.busy = true;
  state.status = pending;
  state.error = false;
  render();
  try {
    await task();
  } catch (error) {
    state.error = true;
    state.status = error?.message || "عملیات انجام نشد؛ دوباره تلاش کنید.";
  } finally {
    state.busy = false;
    render(focusId);
  }
}

async function readFile(
  file,
  maximum = root.EduDeputyExchange.maxBytes || FILE_LIMIT,
) {
  if (!file || file.size === 0)
    throw Error("فایل خالی است؛ فایل JSON معتبر را انتخاب کنید.");
  if (file.size > maximum)
    throw Error(
      "حجم فایل بیشتر از " +
        fa(maximum / 1024 / 1024) +
        " مگابایت است؛ فایل قابل دریافت نیست.",
    );
  let value;
  try {
    value = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
  } catch {
    throw Error(
      "فایل JSON معتبر نیست؛ فایل خروجی برنامه را بدون ویرایش انتخاب کنید.",
    );
  }
  return value;
}

function download(value, name) {
  const blob = new Blob([JSON.stringify(value)], {
    type: "application/json;charset=utf-8",
  });
  if (blob.size > root.EduDeputyStore.maxBackupBytes)
    throw Error(
      "حجم فایل پشتیبان از سقف قابل‌بازیابی بیشتر است؛ فایل تحویل نشد.",
    );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  root.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function start() {
  if (started) return;
  host = document.getElementById("deputyApp");
  if (!host) return;
  started = true;
  document.body.classList.add("ed-deputy-page");
  host.addEventListener("click", (event) => {
    click(event).catch(fatal);
  });
  host.addEventListener("change", (event) => {
    change(event).catch(fatal);
  });
  host.addEventListener("submit", (event) => {
    submit(event).catch(fatal);
  });
  host.addEventListener("input", (event) => {
    if (event.target.id === "deputyNoteText") {
      state.noteText = event.target.value;
      if (!state.noteOrigin) state.noteOrigin = selected()?.key || "";
    }
  });
  host.addEventListener(
    "toggle",
    (event) => {
      if (event.target.id === "deputySourceOptions")
        state.sourceOptionsOpen = event.target.open;
      if (event.target.id === "deputyBackupPanel")
        state.backupOpen = event.target.open;
      if (event.target.id === "deputyNoteEditor")
        state.noteEditorOpen = event.target.open;
    },
    true,
  );
  root.visualViewport?.addEventListener("resize", updateViewport);
  root.visualViewport?.addEventListener("scroll", updateViewport);
  root.addEventListener("resize", updateViewport);
  document.addEventListener("focusin", updateViewport);
  document.addEventListener("focusout", () =>
    root.setTimeout(updateViewport, 0),
  );
  host.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !state.busy &&
      (state.preview || state.restore)
    ) {
      state.preview = null;
      state.restore = null;
      state.status = "بازبینی لغو شد؛ اطلاعاتی جایگزین نشد.";
      render();
    }
  });
  root.addEventListener("beforeunload", (event) => {
    if (hasDraft() || state.busy) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  render();
  try {
    store = await root.EduDeputyStore.open();
    await reload();
    state.ready = true;
    state.status =
      "کارتابل آماده است؛ اطلاعات در مرورگر همین دستگاه نگهداری می‌شود.";
    render();
  } catch (error) {
    fatal(error);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.ready && !state.busy) {
      state.stale = true;
      const message = document.getElementById("deputyMessage");
      if (message)
        message.textContent =
          "برای مشاهدهٔ آخرین اطلاعات پس از بازگشت، تازه‌سازی کنید.";
    }
  });
  root.addEventListener("pagehide", () => {
    store?.close();
  });
  root.addEventListener("pageshow", (event) => {
    if (event.persisted) root.location.reload();
  });
}

function fatal(error) {
  state.error = true;
  state.status = error?.message || "عملیات کارتابل انجام نشد.";
  state.busy = false;
  render();
}

root.EduDeputyUI = Object.freeze({
  start,
  status: () => ({
    ready: state.ready,
    busy: state.busy,
    tab: state.tab,
    error: state.error,
    message: state.status,
    streams: state.rows.length,
  }),
  refresh: () =>
    state.ready
      ? run(async () => {
          await reload();
          state.preview = null;
          state.restore = null;
          state.status = "اطلاعات تازه‌سازی شد.";
        }, "در حال تازه‌سازی…")
      : Promise.resolve(),
});
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
