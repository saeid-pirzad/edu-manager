function attendanceReminderNumber(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString("fa-IR")
    : "۰";
}

function attendanceReminderDate(item) {
  return (
    esc(faDate(item.date)) +
    " · زنگ " +
    attendanceReminderNumber(Number(item.period) + 1)
  );
}

function attendanceReminderItems(model) {
  return [...(model?.items || [])].sort(
    (a, b) =>
      String(b.date).localeCompare(String(a.date)) ||
      Number(b.period) - Number(a.period),
  );
}

function attendanceReminderStatus(item) {
  if (item.kind === "incomplete")
    return "ناقص · " + attendanceReminderNumber(item.unknown) + " نفر";
  return item.kind === "conflict" ? "نیازمند بررسی" : "ثبت نشده";
}

function attendanceReminderRowHtml(item) {
  const tone = ["missing", "incomplete", "conflict"].includes(item.kind)
    ? item.kind
    : "missing";
  return (
    '<li class="attendance-reminder-item is-' +
    tone +
    '"><button type="button" class="attendance-reminder-open" data-workspace-action="attendance-reminder-open" data-key="' +
    esc(item.key) +
    '"><span class="attendance-reminder-date">' +
    attendanceReminderDate(item) +
    '</span><span class="attendance-reminder-identity"><strong>' +
    esc(item.className || "کلاس") +
    '</strong><span class="attendance-reminder-lesson">' +
    esc(item.lessonName || "درس") +
    "</span><small>" +
    esc(item.schoolName || "") +
    '</small></span><span class="attendance-reminder-status">' +
    attendanceReminderStatus(item) +
    '</span><span class="attendance-reminder-arrow" aria-hidden="true">' +
    EduIcons.html("chevron-left") +
    "</span></button></li>"
  );
}

function attendanceReminderRangeHtml(model) {
  return model?.start && model?.end
    ? '<p class="attendance-reminder-range">از <bdi>' +
        esc(faDate(model.start)) +
        "</bdi> تا <bdi>" +
        esc(faDate(model.end)) +
        "</bdi> · بر اساس برنامهٔ هفتگی فعلی</p>"
    : '<p class="attendance-reminder-range">پیگیری زنگ‌های گذشته بر اساس برنامهٔ هفتگی فعلی</p>';
}

function renderAttendanceReminders(model) {
  const items = attendanceReminderItems(model),
    visible = items.slice(0, 3),
    notHeld = model?.notHeld || [];
  if (!items.length && !notHeld.length) return "";
  return (
    '<section class="attendance-reminders' +
    (items.length ? "" : " is-clear") +
    '" aria-labelledby="attendanceRemindersTitle"><header class="attendance-reminders-heading"><span class="attendance-reminders-symbol" aria-hidden="true">' +
    EduIcons.html(items.length ? "attendance" : "check") +
    '</span><div><h3 id="attendanceRemindersTitle">پیگیری حضور‌وغیاب' +
    (items.length
      ? '<span class="attendance-reminders-count">' +
        attendanceReminderNumber(items.length) +
        "</span>"
      : "") +
    "</h3>" +
    attendanceReminderRangeHtml(model) +
    '</div><button type="button" class="ghost attendance-reminders-refresh" data-workspace-action="attendance-reminders-refresh" aria-label="بررسی دوبارهٔ حضور‌وغیاب روزهای گذشته" title="بررسی دوباره">' +
    EduIcons.html("refresh") +
    "</button></header>" +
    (items.length
      ? '<ul class="attendance-reminder-items">' +
        visible.map(attendanceReminderRowHtml).join("") +
        "</ul>"
      : '<p class="attendance-reminders-empty">در این بازه موردی برای پیگیری نیست.</p>') +
    (items.length || notHeld.length
      ? '<footer class="attendance-reminders-footer">' +
        (items.length
          ? '<button type="button" class="ghost" data-workspace-action="attendance-reminders-all">همهٔ موارد (' +
            attendanceReminderNumber(items.length) +
            ")</button>"
          : "") +
        (notHeld.length
          ? '<button type="button" class="ghost attendance-reminders-history-button" data-workspace-action="attendance-reminders-not-held">برگزارنشده‌ها (' +
            attendanceReminderNumber(notHeld.length) +
            ")</button>"
          : "") +
        (items.length > visible.length
          ? "<small>نمایش " +
            attendanceReminderNumber(visible.length) +
            " مورد اخیر</small>"
          : "") +
        "</footer>"
      : "") +
    "</section>"
  );
}

function attendanceReminderPage(rows, requestedPage) {
  const pages = Math.max(1, Math.ceil(rows.length / 50)),
    page = Number.isInteger(requestedPage)
      ? Math.max(0, Math.min(requestedPage, pages - 1))
      : 0,
    offset = page * 50;
  return {
    rows: rows.slice(offset, offset + 50),
    page,
    pages,
    offset,
    total: rows.length,
  };
}

function attendanceReminderPaginationHtml(pagination) {
  if (!pagination.total) return "";
  const { page, pages, offset, rows, total } = pagination;
  return (
    '<div class="attendance-reminder-pagination"><p>موارد ' +
    attendanceReminderNumber(offset + 1) +
    " تا " +
    attendanceReminderNumber(offset + rows.length) +
    " از " +
    attendanceReminderNumber(total) +
    "</p>" +
    (pages > 1
      ? '<nav aria-label="صفحه‌های پیگیری حضور‌وغیاب"><button type="button" class="ghost" data-workspace-action="attendance-reminders-page" data-page="' +
        Math.max(0, page - 1) +
        '"' +
        (page === 0 ? " disabled" : "") +
        ">قبلی</button><span>صفحهٔ " +
        attendanceReminderNumber(page + 1) +
        " از " +
        attendanceReminderNumber(pages) +
        '</span><button type="button" class="ghost" data-workspace-action="attendance-reminders-page" data-page="' +
        Math.min(pages - 1, page + 1) +
        '"' +
        (page === pages - 1 ? " disabled" : "") +
        ">بعدی</button></nav>"
      : "") +
    "</div>"
  );
}

function attendanceReminderListHtml(model, page = 0) {
  const items = attendanceReminderItems(model),
    pagination = attendanceReminderPage(items, page);
  return (
    '<div class="attendance-reminder-list-dialog"><p class="attendance-reminder-intro">زنگ موردنظر را برای ثبت یا تکمیل حضور‌وغیاب انتخاب کنید.</p>' +
    attendanceReminderRangeHtml(model) +
    (items.length
      ? '<ul class="attendance-reminder-items attendance-reminder-scroll">' +
        pagination.rows.map(attendanceReminderRowHtml).join("") +
        "</ul>"
      : '<p class="attendance-reminders-empty">موردی برای پیگیری باقی نمانده است.</p>') +
    attendanceReminderPaginationHtml(pagination) +
    '<div class="attendance-reminder-dialog-actions"><button type="button" class="ghost" data-workspace-action="close">بستن</button></div></div>'
  );
}

function attendanceReminderDialogHtml(item) {
  const key = esc(item.key),
    missing = item.kind === "missing",
    conflict = item.kind === "conflict";
  const recordAttributes =
    ' data-key="' +
    key +
    '"' +
    (item.sessionId ? ' data-session="' + esc(item.sessionId) + '"' : "") +
    (item.sourcePeriodId
      ? ' data-workspace="' + esc(item.sourcePeriodId) + '"'
      : "");
  return (
    '<div class="attendance-reminder-dialog"><section class="attendance-reminder-summary"><span class="attendance-reminder-date">' +
    attendanceReminderDate(item) +
    "</span><h4>" +
    esc(item.className || "کلاس") +
    "</h4><p>" +
    esc(item.lessonName || "درس") +
    "</p><small>" +
    esc(item.schoolName || "") +
    '</small></section><p class="attendance-reminder-explanation' +
    (conflict ? " is-conflict" : "") +
    '">' +
    (missing
      ? "برای این زنگ، جلسه‌ای ثبت نشده است. اگر کلاس برگزار شده، حضور‌وغیاب آن را ثبت کنید."
      : conflict
        ? "برای این تاریخ و زنگ، بیش از یک جلسه ثبت شده است. جلسه‌های ثبت‌شده را جداگانه بررسی کنید."
        : "حضور‌وغیاب " +
          attendanceReminderNumber(item.unknown) +
          " نفر از " +
          attendanceReminderNumber(item.total) +
          " نفر هنوز مشخص نشده است. اطلاعات قبلی جلسه حفظ می‌شود؛ فقط موارد تعیین‌نشده را تکمیل کنید.") +
    "</p>" +
    (conflict
      ? '<div class="attendance-reminder-conflict-sessions">' +
        (item.sessions || [])
          .map(
            (session, index) =>
              '<button type="button" class="ghost" data-workspace-action="attendance-reminder-record" data-key="' +
              key +
              '" data-session="' +
              esc(session.sessionId) +
              '" data-workspace="' +
              esc(session.sourcePeriodId) +
              '">' +
              EduIcons.html("attendance") +
              "بررسی جلسهٔ " +
              attendanceReminderNumber(index + 1) +
              "</button>",
          )
          .join("") +
        "</div>"
      : '<div class="attendance-reminder-primary-action"><button type="button" data-workspace-action="attendance-reminder-record"' +
        recordAttributes +
        (missing ? ' data-mutating="1"' : "") +
        ">" +
        EduIcons.html("attendance") +
        (missing ? "ثبت حضور‌وغیاب این زنگ" : "تکمیل حضور‌وغیاب جلسه") +
        "</button></div>") +
    (missing
      ? '<section class="attendance-reminder-not-held"><p>اگر این زنگ برگزار نشده، آن را مشخص کنید تا از پیگیری خارج شود. این انتخاب، غیبت هنرجویان را ثبت نمی‌کند.</p><button type="button" class="ghost" data-mutating="1" data-workspace-action="attendance-reminder-not-held" data-key="' +
        key +
        '">' +
        EduIcons.html("calendar") +
        "این زنگ برگزار نشده است</button></section>"
      : "") +
    '<p id="operationError" role="alert"></p><div class="attendance-reminder-dialog-actions"><button type="button" class="ghost" data-workspace-action="close">بستن</button></div></div>'
  );
}

function renderNotHeldRemindersHtml(markers, page = 0) {
  const rows = [...(markers || [])].sort(
    (a, b) =>
      String(b.date).localeCompare(String(a.date)) ||
      Number(b.period) - Number(a.period),
  );
  const pagination = attendanceReminderPage(rows, page);
  return (
    '<div class="attendance-reminder-history"><p class="attendance-reminder-intro">زنگ‌هایی که برگزارنشده مشخص کرده‌اید. اگر اشتباهی ثبت شده، یادآور آن را برگردانید.</p>' +
    (rows.length
      ? '<ul class="attendance-reminder-items attendance-reminder-scroll">' +
        pagination.rows
          .map((marker) => {
            const source = marker.sourcePeriodId || marker.workspace || "",
              current = source === workspace?.id;
            return (
              '<li class="attendance-reminder-history-item"><div><span class="attendance-reminder-date">' +
              attendanceReminderDate(marker) +
              "</span><strong>" +
              esc(marker.className || "کلاس") +
              " · " +
              esc(marker.lessonName || "درس") +
              "</strong><small>" +
              esc(marker.schoolName || "") +
              (marker.closed ? " · نوبت بسته" : "") +
              '</small></div><button type="button" class="ghost"' +
              (current ? ' data-mutating="1"' : "") +
              ' data-workspace-action="attendance-reminder-restore" data-key="' +
              esc(marker.id || marker.key) +
              '" data-workspace="' +
              esc(source) +
              '">' +
              EduIcons.html("undo") +
              (current ? "بازگرداندن یادآور" : "باز کردن برای اصلاح") +
              "</button></li>"
            );
          })
          .join("") +
        "</ul>"
      : '<p class="attendance-reminders-empty">زنگ برگزارنشده‌ای ثبت نشده است.</p>') +
    attendanceReminderPaginationHtml(pagination) +
    '<p id="operationError" role="alert"></p><div class="attendance-reminder-dialog-actions"><button type="button" class="ghost" data-workspace-action="close">بستن</button></div></div>'
  );
}
