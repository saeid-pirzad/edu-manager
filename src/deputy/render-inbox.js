// Private deputy bundle fragment; assembled inside the deputy scope.

function sourceControls() {
  const unique = (key, label) => [
    ...new Map(
      state.rows.map((r) => [key(r.packet), label(r.packet)]),
    ).entries(),
  ];
  const narrowed = state.school || state.year || state.sender;
  return (
    '<section class="ed-panel ed-sources"><div class="ed-source-main">' +
    field(
      "پروندهٔ دبیر",
      select(
        "deputySource",
        (state.streamKey &&
        !state.rows.some((row) => row.key === state.streamKey)
          ? option(
              state.streamKey,
              "پروندهٔ انتخاب‌شده دیگر در کارتابل نیست",
              state.streamKey,
            )
          : "") +
          (sourceRows().length
            ? sourceRows().map((row) =>
                option(row.key, identity(row.packet), state.streamKey),
              )
            : [option("", "پرونده‌ای در این محدوده نیست", "")]
          ).join(""),
      ),
    ) +
    '<details id="deputySourceOptions" class="ed-source-options" ' +
    (state.sourceOptionsOpen || narrowed ? "open" : "") +
    "><summary>" +
    icon("settings") +
    "<span>فیلتر پرونده‌ها</span>" +
    icon("arrow", "ed-disclosure-icon") +
    '</summary><div class="ed-source-filters">' +
    field(
      "مدرسه",
      select(
        "deputySchool",
        option("", "همهٔ مدرسه‌ها", state.school) +
          unique(
            (p) => p.school.code,
            (p) => p.school.name + " · " + p.school.code,
          )
            .map(([id, name]) => option(id, name, state.school))
            .join(""),
      ),
    ) +
    field(
      "سال تحصیلی",
      select(
        "deputyYear",
        option("", "همهٔ سال‌های دریافتی", state.year) +
          unique(
            (p) => p.academicYear,
            (p) => p.academicYear,
          )
            .map(([id, name]) => option(id, name, state.year))
            .join(""),
      ),
    ) +
    field(
      "فرستنده",
      select(
        "deputySender",
        option("", "همهٔ فرستنده‌ها", state.sender) +
          unique(
            (p) => p.sender.code,
            (p) => p.sender.name + " · " + p.sender.code,
          )
            .map(([id, name]) => option(id, name, state.sender))
            .join(""),
      ),
    ) +
    '</div></details></div><p class="ed-hint">اطلاعات فقط برای پروندهٔ انتخابی است؛ هنرجویان دبیرهای مختلف خودکار ادغام نمی‌شوند.</p></section>'
  );
}
function changes(plan) {
  const names = {
    classes: "کلاس",
    students: "هنرجو در کلاس",
    lessons: "درس",
    sessions: "جلسه",
    activities: "فعالیت",
  };
  const describe = (values) =>
    Object.entries(names)
      .map(([key, label]) => label + ": " + fa(values?.[key]))
      .join(" · ");
  const status = {
    new: "پروندهٔ جدید",
    update: "به‌روزرسانی پرونده",
    duplicate: "نسخهٔ تکراری؛ بدون تغییر",
    unchanged: "نسخهٔ تکراری؛ بدون تغییر",
    stale: "نسخهٔ قدیمی؛ قابل دریافت نیست",
  };
  return (
    '<div class="ed-import-result"><strong>' +
    esc(status[plan.status] || plan.status) +
    "</strong><dl><div><dt>محتوای فایل</dt><dd>" +
    esc(describe(plan.counts)) +
    "</dd></div><div><dt>افزوده نسبت به نسخهٔ قبل</dt><dd>" +
    esc(describe(plan.added)) +
    "</dd></div><div><dt>حذف‌شده از نسخهٔ قبل</dt><dd>" +
    esc(describe(plan.removed)) +
    "</dd></div><div><dt>ترم‌های به‌روزشده</dt><dd>" +
    esc(
      (plan.updatedPeriods || []).map((term) => labels[term]).join("، ") || "—",
    ) +
    "</dd></div></dl>" +
    (plan.changed
      ? '<p class="ed-change-summary">' +
        (Object.values(plan.changed).some((value) => value > 0)
          ? "تغییر وضعیت حضور: " +
            fa(plan.changed.attendance) +
            " · مؤلفهٔ نمره: " +
            fa(plan.changed.assessments) +
            " · قواعد درس/ترم: " +
            fa(plan.changed.policies)
          : "در حضور، مؤلفه‌های نمره و قواعد درس تغییری نیست؛ نسخهٔ ارسالی یا سایر مشخصات پرونده بررسی می‌شود.") +
        "</p>"
      : "") +
    (plan.metadataChanged
      ? '<p class="ed-hint">نام نمایشی دبیر اصلاح می‌شود؛ ' +
        (plan.updatedPeriods.length
          ? "اطلاعات آموزشی نیز مطابق بازبینی جدید به‌روز می‌شود."
          : "اطلاعات آموزشی بدون تغییر است.") +
        "</p>"
      : "") +
    "</div>"
  );
}

function previewPanel() {
  const preview = state.preview;
  if (!preview) return "";
  const packet = preview.packet;
  const blocked = ["duplicate", "unchanged", "stale"].includes(
    preview.plan.status,
  );
  return (
    '<section class="ed-panel ed-preview" id="deputyImportPreview" tabindex="-1"><div class="ed-section-heading"><h2>بازبینی پیش از دریافت</h2><span class="ed-badge">هنوز ثبت نشده</span></div><h3>' +
    esc(packet.school.name) +
    "</h3><p>" +
    esc(packet.sender.name + " · کد فرستنده: " + packet.sender.code) +
    "</p><p>" +
    esc(packet.academicYear) +
    " · تهیهٔ فایل: " +
    esc(date(packet.exportedAt)) +
    "</p>" +
    changes(preview.plan) +
    '<p class="ed-hint">این فایل تصویر کامل اطلاعات ارسالی همین دبیر و مدرسه در سال است. دریافت نسخهٔ جدید، اطلاعات قبلی همین پرونده را جایگزین می‌کند؛ یادداشت‌های پیگیری شما حفظ می‌شوند.</p><div class="ed-actions">' +
    action(
      "confirm-import",
      "تأیید و دریافت اطلاعات",
      blocked ? "disabled" : "",
    ) +
    action("cancel-preview", "انصراف", "", "ed-secondary") +
    "</div></section>"
  );
}

function receive() {
  return (
    '<section class="ed-panel ed-receive-intro"><div class="ed-intro-heading">' +
    icon("upload", "ed-intro-symbol") +
    '<div><span class="ed-eyebrow">همگام‌سازی با فایل</span><h2>دریافت اطلاعات دبیر</h2></div></div><p>فایل «ارسال به معاون» را انتخاب کنید و پس از بازبینی تأیید کنید؛ فایل جدید همان پرونده را به‌روز می‌کند و پیگیری‌ها باقی می‌مانند.</p><div class="ed-actions">' +
    action("choose-import", "انتخاب فایل دبیر") +
    '<input type="file" id="deputyImportFile" accept=".json,application/json" hidden></div><p class="ed-hint">فایل پشتیبان کامل دبیر و خروجی متنی گزارش، فایل تبادل معاون نیستند.</p></section>' +
    previewPanel() +
    '<section class="ed-panel"><div class="ed-section-heading"><h2>پرونده‌های دریافت‌شده</h2><span class="ed-badge">' +
    fa(state.rows.length) +
    " پرونده</span></div>" +
    (state.rows.length
      ? '<div class="ed-inbox">' +
        state.rows
          .map(
            (row) =>
              '<article class="ed-inbox-card">' +
              icon("school", "ed-source-symbol") +
              '<div class="ed-inbox-identity"><h3>' +
              esc(row.packet.school.name) +
              "</h3><p>" +
              esc(row.packet.sender.name + " · " + row.packet.academicYear) +
              '</p><small>کد دبیر: <bdi dir="ltr">' +
              esc(row.packet.sender.code) +
              '</bdi> · کد مدرسه: <bdi dir="ltr">' +
              esc(row.packet.school.code) +
              "</bdi></small><small>دریافت: " +
              esc(dateTime(row.receivedAt)) +
              " · آخرین فایل: " +
              esc(dateTime(row.packet.exportedAt)) +
              "</small><small>" +
              esc(
                row.packet.periods
                  .map(
                    (period) =>
                      labels[period.termKind] +
                      ": بازبینی " +
                      fa(period.revision),
                  )
                  .join(" · "),
              ) +
              "</small></div>" +
              action(
                "open-stream",
                "مشاهده",
                'data-stream="' + esc(row.key) + '"',
                "ed-secondary",
              ) +
              "</article>",
          )
          .join("") +
        "</div>"
      : empty(
          "هنوز اطلاعاتی دریافت نشده",
          "پس از دریافت فایل دبیر، پروندهٔ او اینجا نمایش داده می‌شود.",
        )) +
    "</section>" +
    backupPanel()
  );
}

function backupPanel() {
  return (
    '<details id="deputyBackupPanel" class="ed-panel ed-help" ' +
    (state.backupOpen || state.restore ? "open" : "") +
    "><summary>" +
    icon("shield") +
    "<span>پشتیبان و نگهداری کارتابل</span>" +
    icon("arrow", "ed-disclosure-icon") +
    '</summary><p>اطلاعات فقط در مرورگر همین دستگاه ذخیره می‌شود؛ با پاک‌کردن دادهٔ مرورگر ممکن است کارتابل از بین برود. پشتیبان کارتابل شامل پرونده‌های دریافتی و یادداشت‌های معاون است.</p><div class="ed-actions ed-backup-actions">' +
    action("backup", "دریافت پشتیبان کارتابل", "", "ed-secondary") +
    action("choose-restore", "بازیابی پشتیبان کارتابل", "", "ed-secondary") +
    '<input type="file" id="deputyRestoreFile" accept=".json,application/json" hidden></div>' +
    (state.safetyInfo
      ? '<p class="ed-hint">نسخهٔ ایمنی پیش از آخرین بازیابی · ' +
        esc(date(state.safetyInfo.exportedAt)) +
        "؛ برای نگهداری خارج از مرورگر، فایل آن را دریافت کنید.</p>" +
        action(
          "safety-backup",
          "دریافت نسخهٔ ایمنی آخرین بازیابی",
          "",
          "ed-secondary",
        )
      : "") +
    '<p class="ed-hint">فایل‌ها JSON خوانا و بدون امضای دیجیتال هستند؛ هویت فرستنده را از مسیر مورد اعتماد تأیید کنید. بانک معاون مستقل است، اما جداسازی آن به معنی ورود امن یا رمزگذاری نیست. بازیابی پشتیبان کارتابل با دریافت فایل دبیر متفاوت است.</p></details>' +
    (state.restore
      ? '<section class="ed-panel ed-preview" id="deputyRestorePreview" tabindex="-1"><h2>بازبینی بازیابی کارتابل</h2><p>پشتیبان انتخاب‌شده: ' +
        fa(state.restore.value.streams.length) +
        " پرونده و " +
        fa(state.restore.value.followups.length) +
        ' یادداشت پیگیری.</p><p class="ed-warning">بازیابی، کل کارتابل فعلی و یادداشت‌های آن را با این پشتیبان جایگزین می‌کند. ابتدا پشتیبان فعلی را دریافت کنید.</p><label class="ed-checkbox"><input type="checkbox" id="deputyRestoreConsent"> متوجه‌ام که اطلاعات فعلی کارتابل جایگزین می‌شود.</label><div class="ed-actions">' +
        action(
          "confirm-restore",
          "تأیید جایگزینی کارتابل",
          "disabled",
          "ed-danger",
        ) +
        action("cancel-restore", "انصراف", "", "ed-secondary") +
        "</div></section>"
      : "")
  );
}

function followupForm() {
  const row = selected();
  if (
    state.noteOrigin &&
    state.noteOrigin !== row?.key &&
    (state.editing || hasDraft())
  )
    return (
      '<section class="ed-panel"><h2>متن پیگیری ذخیره‌نشده</h2><p class="ed-warning">منبع این یادداشت دیگر در محدودهٔ انتخاب‌شده نیست. برای جلوگیری از ثبت در پروندهٔ اشتباه، ذخیره مسدود است. متن را نگه دارید یا از ویرایش صرف‌نظر کنید.</p>' +
      field(
        "متن یادداشت",
        '<textarea id="deputyNoteText" rows="4" maxlength="4000">' +
          esc(state.noteText) +
          "</textarea>",
      ) +
      '<div class="ed-actions">' +
      action("cancel-note", "صرف‌نظر از ویرایش", "", "ed-secondary") +
      "</div></section>"
    );
  if (!row) return "";
  const all = classes(row.packet);
  const students = all.find((c) => c.id === state.noteClass)?.students || [];
  return (
    '<details id="deputyNoteEditor" class="ed-panel ed-note-editor" ' +
    (state.editing || hasDraft() || state.noteEditorOpen ? "open" : "") +
    "><summary>" +
    icon(state.editing ? "edit" : "add") +
    "<span>" +
    (state.editing ? "ویرایش پیگیری" : "پیگیری جدید") +
    "</span>" +
    icon("arrow", "ed-disclosure-icon") +
    '</summary><p class="ed-hint">این یادداشت فقط در کارتابل معاون ذخیره می‌شود و حضور یا نمرهٔ دبیر را تغییر نمی‌دهد.</p><form id="deputyFollowupForm">' +
    (state.editing
      ? '<p class="ed-hint">' +
        esc(
          (state.editing.snapshot?.className || "کلاس") +
            " · " +
            (state.editing.snapshot?.studentName || "هنرجو"),
        ) +
        "</p>"
      : '<div class="ed-filters">' +
        field(
          "کلاس",
          select(
            "deputyNoteClass",
            option("", "کلاس را انتخاب کنید", state.noteClass) +
              all.map((c) => option(c.id, c.name, state.noteClass)).join(""),
          ),
        ) +
        field(
          "هنرجو",
          select(
            "deputyNoteStudent",
            option("", "هنرجو را انتخاب کنید", state.noteStudent) +
              students
                .map((student) =>
                  option(
                    student.id,
                    student.name + (student.code ? " · " + student.code : ""),
                    state.noteStudent,
                  ),
                )
                .join(""),
          ),
        ) +
        "</div>") +
    field(
      "یادداشت پیگیری",
      '<textarea id="deputyNoteText" maxlength="4000" rows="3" required placeholder="موضوع و اقدام بعدی را بنویسید…">' +
        esc(state.noteText) +
        "</textarea>",
    ) +
    '<div class="ed-actions"><button class="ed-button" type="submit">' +
    icon("save") +
    "<span>ذخیرهٔ پیگیری</span></button>" +
    (state.editing
      ? action("cancel-note", "انصراف از ویرایش", "", "ed-secondary")
      : "") +
    "</div></form></details>"
  );
}

function followups() {
  const row = selected();
  const items = state.followups
    .filter((item) => !row || item.streamKey === row.key)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    sourceControls() +
    '<section class="ed-panel"><div class="ed-section-heading"><h2>یادداشت‌های پیگیری' +
    (row ? " این پرونده" : "") +
    '</h2><span class="ed-badge">' +
    fa(items.filter((item) => item.status === "open").length) +
    " باز</span></div>" +
    (items
      .map(
        (item) =>
          '<article class="ed-followup"><div class="ed-section-heading"><h3>' +
          esc(item.snapshot?.studentName || "هنرجو") +
          '</h3><span class="ed-badge ' +
          (item.status === "done" ? "ed-done" : "") +
          '">' +
          (item.status === "done" ? "انجام‌شده" : "در انتظار پیگیری") +
          '</span></div><p class="ed-hint">' +
          esc(
            (item.snapshot?.schoolName || "مدرسه") +
              " · " +
              (item.snapshot?.className || "کلاس") +
              " · " +
              (item.snapshot?.senderName || "فرستنده"),
          ) +
          " · " +
          esc(date(item.updatedAt)) +
          '</p><p class="ed-note">' +
          esc(item.note) +
          '</p><div class="ed-actions">' +
          action(
            "toggle-note",
            item.status === "done" ? "بازگشایی پیگیری" : "انجام شد",
            'data-note="' + esc(item.id) + '"',
            "ed-secondary",
          ) +
          (row && item.streamKey === row.key
            ? action(
                "edit-note",
                "ویرایش یادداشت",
                'data-note="' + esc(item.id) + '"',
                "ed-secondary",
              )
            : "") +
          "</div></article>",
      )
      .join("") ||
      empty(
        "پیگیری ثبت نشده",
        "با انتخاب پرونده، کلاس و هنرجو می‌توانید یادداشت مستقل ثبت کنید.",
      )) +
    "</section>" +
    followupForm()
  );
}
