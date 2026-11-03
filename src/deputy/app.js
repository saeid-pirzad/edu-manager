function header() {
  return (
    '<header class="ed-header"><div class="ed-brand"><span class="ed-brand-mark" aria-hidden="true">' +
    icon("book") +
    "</span><div><h1>کلاس‌یار</h1><p>کارتابل معاون</p></div></div>" +
    '<details class="ed-navigation-menu" id="deputyMenu"><summary aria-label="منوی کارتابل معاون"><svg class="ed-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg><span class="ed-sr-only">منوی کارتابل</span></summary><div class="ed-header-actions">' +
    navigation() +
    action(
      "open-backups",
      "پشتیبان و بازیابی",
      state.ready && !state.busy ? "" : "disabled",
      "ed-secondary ed-header-backup",
    ) +
    action(
      "refresh",
      "بازخوانی کارتابل",
      (state.ready && !state.busy ? "" : "disabled ") +
        ' aria-label="بازخوانی اطلاعات ذخیره‌شده در همین مرورگر" title="برای دریافت تغییرات دبیر، فایل جدید را وارد کنید"',
      "ed-secondary ed-header-refresh",
    ) +
    "</div></details></header>"
  );
}

function dashboardOverview() {
  return '<section class="workflow-welcome schools-welcome ed-dashboard-banner no-print"><span class="schools-welcome-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 9h1M15 9h1M8 12h1M15 12h1"/></svg></span><div class="schools-welcome-copy"><h2>کارتابل معاون</h2><p>پرونده‌های دبیرها را دریافت کنید؛ گزارش‌ها و پیگیری‌های مدرسه را یک‌جا ببینید.</p></div><div class="schools-welcome-footer"><div class="schools-period-context"><span>پرونده‌های دریافتی دبیرها</span><span>گزارش‌ها و پیگیری‌های مدرسه</span></div><button type="button" class="schools-about" data-deputy-action="about"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg><span>درباره و ارتباط</span></button></div></section>';
}
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
      ["files", "folder", "پرونده‌ها"],
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
      : state.tab === "files"
        ? receivedFiles()
        : state.tab === "reports"
          ? reports()
          : followups()
    : empty(
        "در حال آماده‌سازی کارتابل",
        "بانک اطلاعاتی معاون مستقل از اطلاعات دبیر باز می‌شود.",
      );
  host.innerHTML =
    header() +
    '<div class="ed-status ' +
    (state.error ? "ed-status-error" : "") +
    '" role="status" aria-live="polite" id="deputyMessage">' +
    esc(state.status) +
    "</div>" +
    '<div id="deputyAutomaticNotice">' +
    automaticBackupNotice() +
    "</div>" +
    (state.stale
      ? '<p class="ed-warning">اطلاعات ممکن است در پنجرهٔ دیگری تغییر کرده باشد؛ برای مشاهدهٔ آخرین نسخه، بازخوانی کنید.</p>'
      : "") +
    '<fieldset class="ed-workspace" ' +
    (state.busy || !state.ready ? "disabled" : "") +
    ' aria-busy="' +
    state.busy +
    '"><legend class="ed-sr-only">کارتابل معاون</legend>' +
    '<div class="ed-content">' +
    body +
    "</div></fieldset>" +
    backupDialog() +
    navigation(true) +
    '<footer class="ed-footer">' +
    icon("shield") +
    "<span>فقط مشاهده و پیگیری · اطلاعات آموزشی دبیر تغییر نمی‌کند.</span></footer>";
  const externalStatus = document.getElementById("deputyStatus");
  if (externalStatus) externalStatus.textContent = "";
  const backup = document.getElementById("deputyBackupDialog");
  if (state.backupOpen && backup && !backup.open) backup.showModal();
  updateNavigationLayout();
  root.initShamsiPickers();
  root.syncShamsiDisabledInputs();
  for (const fieldName of ["from", "to"]) syncDeputyDateProxy(fieldName);
  if (focusId) document.getElementById(focusId)?.focus();
}

function compactNavigation() {
  return root.matchMedia(
    "(max-width: 700px), (max-width: 1000px) and (pointer: coarse)",
  ).matches;
}
function updateNavigationLayout() {
  const menu = document.getElementById("deputyMenu");
  if (!menu) return;
  const compact = compactNavigation();
  if (!compact) menu.open = true;
  else if (menu.dataset.desktop === "true") menu.open = false;
  menu.dataset.desktop = String(!compact);
}
function updateViewport() {
  updateNavigationLayout();
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
    if (event.target.id === "deputyBackupDialog") {
      const rect = event.target.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        closeBackups();
    }
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
      if (event.target.id === "deputyNoteEditor")
        state.noteEditorOpen = event.target.open;
    },
    true,
  );
  host.addEventListener(
    "cancel",
    (event) => {
      if (event.target.id !== "deputyBackupDialog") return;
      event.preventDefault();
      closeBackups();
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
    if (event.key === "Escape" && state.backupOpen) return;
    if (event.key === "Escape") {
      const menu = document.getElementById("deputyMenu");
      if (menu?.open && compactNavigation()) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
        return;
      }
    }
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
  document.addEventListener("click", (event) => {
    const menu = document.getElementById("deputyMenu");
    if (menu?.open && compactNavigation() && !menu.contains(event.target))
      menu.open = false;
  });
  render();
  try {
    store = await root.EduDeputyStore.open();
    await reload();
    state.ready = true;
    automaticBackup = root.EduDeputyAutoBackup?.create({
      store,
      onChange: updateAutomaticBackupUI,
      canWrite: () => state.ready && !state.busy,
    });
    await automaticBackup?.init();
    state.status =
      "کارتابل آماده است؛ اطلاعات در مرورگر همین دستگاه نگهداری می‌شود.";
    render();
  } catch (error) {
    fatal(error);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void automaticBackup?.saveDue();
    if (document.visibilityState === "visible" && state.ready && !state.busy) {
      state.stale = true;
      const message = document.getElementById("deputyMessage");
      if (message)
        message.textContent =
          "برای مشاهدهٔ آخرین اطلاعات پس از بازگشت، تازه‌سازی کنید.";
    }
  });
  root.addEventListener("pagehide", () => {
    if (automaticBackup)
      void automaticBackup.dispose().finally(() => store?.close());
    else store?.close();
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
    automaticBackup: automaticBackup?.status() || null,
  }),

  prepareForUpdate: async () => {
    const check = () => {
      if (!state.ready || state.busy || automaticBackup?.status().busy)
        throw Error(
          "عملیات در حال انجام است؛ پس از پایان آن دوباره تلاش کنید.",
        );
      if (hasDraft())
        throw Error(
          "ابتدا یادداشت پیگیری را ذخیره کنید یا از ویرایش صرف‌نظر کنید.",
        );
      if (state.preview || state.restore)
        throw Error("ابتدا بازبینی فایل را تأیید یا لغو کنید.");
    };
    check();
    await store.backup();
    check();
    return true;
  },

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

function backupDialog() {
  return (
    '<dialog id="deputyBackupDialog" class="ed-backup-dialog" aria-labelledby="deputyBackupTitle"><header class="modal-header"><h3 id="deputyBackupTitle">پشتیبان و بازیابی</h3>' +
    action(
      "close-backups",
      "بستن پنجره",
      state.busy ? "disabled" : "",
      "ed-backup-close",
    ) +
    '</header><div class="modal-body" id="deputyBackupBody"><p class="ed-status ' +
    (state.error ? "ed-status-error" : "") +
    '" role="status" aria-live="polite">' +
    esc(state.status) +
    '</p><fieldset class="ed-workspace" ' +
    (state.busy ? "disabled" : "") +
    ' aria-busy="' +
    state.busy +
    '"><legend class="ed-sr-only">پشتیبان کارتابل</legend>' +
    backupPanel() +
    "</fieldset></div></dialog>"
  );
}
function closeBackups() {
  if (state.busy) return;
  state.backupOpen = false;
  state.restore = null;
  document.getElementById("deputyBackupDialog")?.close();
  const opener = document.querySelector('[data-deputy-action="open-backups"]');
  if (opener?.getClientRects().length) opener.focus();
  else document.querySelector("#deputyMenu > summary")?.focus();
}
