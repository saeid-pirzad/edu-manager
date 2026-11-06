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
  if (item.kind === "empty") return "ثبت شروع نشده";
  if (item.kind === "incomplete")
    return "ناقص · " + attendanceReminderNumber(item.unknown) + " نفر";
  return item.kind === "conflict" ? "نیازمند بررسی" : "ثبت نشده";
}

function attendanceReminderRowHtml(item) {
  const tone = ["missing", "empty", "incomplete", "conflict"].includes(
    item.kind,
  )
    ? item.kind
    : "missing";
  return (
    '<li class="attendance-reminder-item is-' +
    tone +
    (tone === "empty" ? " is-missing" : "") +
    '"><button type="button" class="attendance-reminder-open" data-ui-icon="none" data-workspace-action="attendance-reminder-open" data-key="' +
    esc(item.key) +
    '"><span class="attendance-reminder-identity"><strong>' +
    esc(item.className || "کلاس") +
    '</strong><span class="attendance-reminder-lesson">' +
    esc(item.lessonName || "درس") +
    '</span></span><span class="attendance-reminder-status">' +
    attendanceReminderStatus(item) +
    '</span><span class="attendance-reminder-meta"><span class="attendance-reminder-date">' +
    attendanceReminderDate(item) +
    '</span><span class="attendance-reminder-school">' +
    esc(item.schoolName || "") +
    "</span></span></button></li>"
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
    '" aria-labelledby="attendanceRemindersTitle"><header class="attendance-reminders-heading"><div><h3 id="attendanceRemindersTitle">پیگیری حضور‌وغیاب' +
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
    empty = item.kind === "empty",
    canMarkNotHeld = missing || empty,
    foreignEmpty = empty && item.sourcePeriodId !== workspace?.id,
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
    '<div class="attendance-reminder-dialog is-' +
    (conflict
      ? "conflict"
      : empty
        ? "empty is-missing"
        : missing
          ? "missing"
          : "incomplete") +
    '"><section class="attendance-reminder-summary"><div class="attendance-reminder-summary-meta"><span class="attendance-reminder-date">' +
    attendanceReminderDate(item) +
    '</span><span class="attendance-reminder-status">' +
    attendanceReminderStatus(item) +
    "</span></div><h4>" +
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
      : empty
        ? "جلسه فقط باز شده و هیچ حضور، نمره یا فعالیتی ثبت نشده است. اگر کلاس برگزار نشده، می‌توانید وضعیت آن را با تأیید خود مشخص کنید."
        : conflict
          ? "برای این تاریخ و زنگ، بیش از یک جلسه ثبت شده است. جلسه‌های ثبت‌شده را جداگانه بررسی کنید."
          : "حضور‌وغیاب " +
            attendanceReminderNumber(item.unknown) +
            " نفر از " +
            attendanceReminderNumber(item.total) +
            " نفر هنوز مشخص نشده است. اطلاعات قبلی جلسه حفظ می‌شود؛ فقط موارد تعیین‌نشده را تکمیل کنید.") +
    '</p><div class="attendance-reminder-choices">' +
    (conflict
      ? '<div class="attendance-reminder-conflict-sessions">' +
        (item.sessions || [])
          .map(
            (session, index) =>
              '<button type="button" class="ghost" data-ui-icon="none" data-workspace-action="attendance-reminder-record" data-key="' +
              key +
              '" data-session="' +
              esc(session.sessionId) +
              '" data-workspace="' +
              esc(session.sourcePeriodId) +
              '">' +
              "بررسی جلسهٔ " +
              attendanceReminderNumber(index + 1) +
              "</button>",
          )
          .join("") +
        "</div>"
      : '<section class="attendance-reminder-choice is-record"><h5>' +
        (canMarkNotHeld ? "جلسه برگزار شده" : "تکمیل اطلاعات جلسه") +
        "</h5><p>" +
        (missing
          ? "حضور‌وغیاب این زنگ را ثبت کنید."
          : "جلسه ابتدا در حالت مشاهده باز می‌شود؛ برای تغییر، ویرایش را فعال کنید.") +
        '</p><div class="attendance-reminder-primary-action"><button type="button" data-ui-icon="none" data-workspace-action="attendance-reminder-record"' +
        recordAttributes +
        (missing ? ' data-mutating="1"' : "") +
        ">" +
        (missing ? "ثبت حضور‌وغیاب این زنگ" : "تکمیل حضور‌وغیاب جلسه") +
        "</button></div></section>") +
    (canMarkNotHeld
      ? '<section class="attendance-reminder-choice attendance-reminder-not-held"><h5>جلسه برگزار نشده</h5><p>' +
        (empty
          ? "با تأیید شما، فقط همین رکورد خالی با نشان «برگزار نشده» جایگزین می‌شود. این انتخاب، غیبت هنرجویان را ثبت نمی‌کند."
          : "این زنگ از پیگیری خارج می‌شود. این انتخاب، غیبت هنرجویان را ثبت نمی‌کند.") +
        '</p><button type="button" class="ghost" data-ui-icon="none"' +
        (foreignEmpty ? "" : ' data-mutating="1"') +
        ' data-workspace-action="attendance-reminder-not-held"' +
        (empty ? recordAttributes : ' data-key="' + key + '"') +
        ">" +
        (foreignEmpty
          ? "باز کردن برای تعیین وضعیت"
          : "این زنگ برگزار نشده است") +
        "</button></section>"
      : "") +
    '</div><p id="operationError" role="alert"></p><div class="attendance-reminder-dialog-actions"><button type="button" class="ghost" data-workspace-action="close">بستن</button></div></div>'
  );
}

function compareNotHeldReminders(a, b) {
  const dateOrder = String(b.date).localeCompare(String(a.date)),
    bellOrder = Number(a.period) - Number(b.period);
  if (dateOrder || bellOrder) return dateOrder || bellOrder;
  const fields = [
    [a.schoolName, b.schoolName],
    [a.className, b.className],
    [a.lessonName, b.lessonName],
    [a.sourcePeriodId || a.workspace, b.sourcePeriodId || b.workspace],
    [a.id || a.key, b.id || b.key],
  ];
  for (const [left, right] of fields) {
    const order = String(left || "").localeCompare(String(right || ""), "fa", {
      numeric: true,
    });
    if (order) return order;
  }
  // Natural collation can equate distinct IDs such as item-1 and item-01.
  // Keep equal-looking entries stable regardless of their input order.
  for (const [left, right] of fields) {
    const l = String(left || ""),
      r = String(right || "");
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

function attendanceReminderHistoryRowHtml(marker) {
  const source = marker.sourcePeriodId || marker.workspace || "",
    current = source === workspace?.id;
  return (
    '<li class="attendance-reminder-history-item"><div class="attendance-reminder-history-details"><div class="attendance-reminder-history-meta"><span class="attendance-reminder-date">زنگ ' +
    attendanceReminderNumber(Number(marker.period) + 1) +
    '</span><span class="attendance-reminder-history-tag' +
    (marker.closed ? " is-closed" : "") +
    '">' +
    (marker.closed ? "نوبت بسته" : "برگزار نشده") +
    '</span></div><div class="attendance-reminder-history-identity"><strong>' +
    esc(marker.className || "کلاس") +
    '</strong><span class="attendance-reminder-lesson">' +
    esc(marker.lessonName || "درس") +
    '</span></div><span class="attendance-reminder-school">' +
    esc(marker.schoolName || "") +
    '</span></div><button type="button" class="ghost attendance-reminder-history-restore"' +
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
}

function attendanceReminderHistoryGroupsHtml(rows) {
  const dates = new Map();
  for (const row of rows) {
    if (!dates.has(row.date)) dates.set(row.date, []);
    dates.get(row.date).push(row);
  }
  return (
    '<div class="attendance-reminder-history-groups attendance-reminder-scroll">' +
    [...dates]
      .map(
        ([date, sessions]) =>
          '<section class="attendance-reminder-history-day" data-date="' +
          esc(date) +
          '" aria-label="جلسات برگزارنشدهٔ ' +
          esc(faDate(date)) +
          '"><h4 class="attendance-reminder-history-day-title"><time dir="ltr" datetime="' +
          esc(date) +
          '">' +
          esc(faDate(date)) +
          '</time></h4><ul class="attendance-reminder-items">' +
          sessions.map(attendanceReminderHistoryRowHtml).join("") +
          "</ul></section>",
      )
      .join("") +
    "</div>"
  );
}

function renderNotHeldRemindersHtml(markers, page = 0) {
  const rows = [...(markers || [])].sort(compareNotHeldReminders);
  const pagination = attendanceReminderPage(rows, page);
  return (
    '<div class="attendance-reminder-history"><div class="attendance-reminder-history-heading"><span class="attendance-reminder-history-symbol" aria-hidden="true">' +
    EduIcons.html("calendar") +
    '</span><div><p class="attendance-reminder-intro">ثبت‌های برگزارنشدن جلسه</p><small>برای اصلاح، یادآور را برگردانید.</small></div><span class="attendance-reminder-history-count"><bdi>' +
    attendanceReminderNumber(rows.length) +
    "</bdi><small>جلسه</small></span></div>" +
    (rows.length
      ? attendanceReminderHistoryGroupsHtml(pagination.rows)
      : '<section class="attendance-reminders-empty attendance-reminder-history-empty"><strong>فهرست خالی است</strong><p>زنگ برگزارنشده‌ای ثبت نشده است.</p></section>') +
    (pagination.pages > 1 ? attendanceReminderPaginationHtml(pagination) : "") +
    '<p id="operationError" role="alert"></p><div class="attendance-reminder-dialog-actions"><button type="button" class="ghost" data-workspace-action="close">بستن</button></div></div>'
  );
}
