function deputyExportPanelMarkup() {
  return (
    '<form id="deputyExportPanel" class="record-editor" data-workspace-submit="prepare-deputy-packet"><div class="record-editor-context"><h4>ارسال اطلاعات به معاون</h4><p>اطلاعات ثبت‌شدهٔ مدرسهٔ انتخابی در ترم اول و دوم همین سال؛ این فایل پشتیبان نیست و محدودیت تاریخ گزارش روی آن اعمال نمی‌شود.</p></div>' +
    '<fieldset data-deputy-export-fields disabled><label class="course-field">مدرسه<select name="deputySchool" id="deputySchool" required aria-describedby="deputyExportError"><option value="">انتخاب مدرسه</option></select></label>' +
    '<p class="muted" data-deputy-export-sender></p>' +
    '<p class="muted" data-deputy-legacy-warning hidden></p>' +
    '<details class="record-editor-context" data-deputy-export-identity open><summary tabindex="0">مشخصات ارسال · تنظیم یک‌باره</summary>' +
    '<label class="course-field">نام دبیر<input name="deputySenderName" id="deputySenderName" required maxlength="200" autocomplete="name" aria-describedby="deputyExportError"></label>' +
    '<label class="course-field">کد مدرسه<input name="deputySchoolCode" id="deputySchoolCode" required maxlength="64" dir="ltr" autocomplete="off" spellcheck="false" aria-describedby="deputyIdentityHint deputyExportError"></label>' +
    '<p id="deputyIdentityHint" class="muted">کد مدرسه را فقط یک‌بار با معاون هماهنگ کنید؛ همهٔ دبیرهای همین مدرسه باید یک کد مشترک داشته باشند. مشخصات در برنامه و پشتیبان کامل نگهداری می‌شوند و ارسال بعدی نیاز به ورود دوباره ندارد.</p>' +
    '<label class="course-field" data-deputy-identity-mode>سابقهٔ ارسال<select name="deputyIdentityMode" required><option value="">انتخاب کنید</option><option value="new">اولین ارسال من است</option><option value="existing">قبلاً فایل به معاون داده‌ام</option></select></label>' +
    '<details data-deputy-identity-advanced><summary tabindex="0">شناسهٔ فرستنده / ادامهٔ فایل‌های قبلی</summary>' +
    '<p class="muted">برای اولین ارسال، شناسه خودکار ساخته می‌شود. اگر قبلاً فایل فرستاده‌اید، همان کد فرستندهٔ فایل قبلی را وارد کنید تا پروندهٔ جدا ساخته نشود.</p>' +
    '<label class="course-field">شناسهٔ فرستنده<input name="deputySenderCode" id="deputySenderCode" required maxlength="64" dir="ltr" autocomplete="off" spellcheck="false" aria-describedby="deputyExportError"></label>' +
    '</details><label data-deputy-change-identity hidden><input type="checkbox" name="deputyChangeIdentity"> اصلاح کدهای ثبت‌شده؛ ممکن است در معاون پروندهٔ جدا ساخته شود.</label></details>' +
    '<label><input type="checkbox" name="deputyConsent" required> فایل شامل نام هنرجویان، حضور و نمره‌هاست و رمزگذاری نشده؛ آن را فقط برای معاون مورداعتماد می‌فرستم.</label></fieldset>' +
    '<section class="record-editor-context" data-deputy-export-preview hidden aria-label="پیش‌نمایش اطلاعات فایل"></section><p data-deputy-export-status role="status" aria-live="polite">در حال بررسی اطلاعات ثبت‌شدهٔ سال…</p><p id="deputyExportError" data-deputy-export-error role="alert"></p>' +
    '<div class="record-editor-actions"><button type="submit" data-deputy-export-prepare disabled>بررسی و آماده‌سازی فایل</button><button type="button" class="success" data-workspace-action="export-deputy-packet" hidden>دریافت فایل معاون</button><button type="button" class="ghost" data-workspace-action="close">بستن</button></div><p class="muted">فایل را دریافت و در پیام‌رسان برای معاون بفرستید؛ دانلود به معنی ارسال آنلاین یا تحویل نیست.</p></form>'
  );
}

function deputyExportSuggestedName(parts, schoolId) {
  const names = new Set();
  for (const part of parts)
    for (const school of part.data.schools)
      if (school.id === schoolId)
        for (const classroom of school.classes || [])
          for (const lesson of classroom.lessons || [])
            if (typeof lesson.teacher === "string" && lesson.teacher.trim())
              names.add(lesson.teacher.trim());
  return names.size === 1 ? [...names][0] : "";
}

function deputyExportSavedSchool(session) {
  const id = session.panel.querySelector('[name="deputySchool"]').value;
  return (session.identity?.schools || session.legacy.schools || []).find(
    (row) => row?.year === session.year && row.id === id,
  );
}

function deputyExportIdentityPresentation(session, { resetOpen = false } = {}) {
  const panel = session.panel,
    node = (name) => panel.querySelector('[name="' + name + '"]'),
    knownSender = !!(session.identity || session.legacy.sender?.code),
    mode = node("deputyIdentityMode"),
    changing = node("deputyChangeIdentity").checked,
    savedSchool = deputyExportSavedSchool(session);
  panel.querySelector("[data-deputy-identity-mode]").hidden = knownSender;
  mode.required = !knownSender;
  mode.disabled = knownSender;
  panel.querySelector("[data-deputy-change-identity]").hidden =
    !knownSender && !savedSchool;
  node("deputySenderCode").readOnly =
    (knownSender && !changing) || (!knownSender && mode.value !== "existing");
  node("deputySchoolCode").readOnly = !!savedSchool && !changing;
  const ready =
    node("deputySenderName").value.trim() &&
    node("deputySchoolCode").value.trim() &&
    node("deputySenderCode").value.trim() &&
    (knownSender || ["new", "existing"].includes(mode.value));
  if (resetOpen)
    panel.querySelector("[data-deputy-export-identity]").open = !ready;
  panel.querySelector("[data-deputy-export-sender]").textContent =
    (session.identity ? "فرستندهٔ ثبت‌شده: " : "فرستنده: ") +
    (node("deputySenderName").value.trim() || "هنوز مشخص نشده") +
    (session.identity ? " · مشخصات برای ارسال‌های بعد محفوظ است." : "");
  const warning = panel.querySelector("[data-deputy-legacy-warning]");
  warning.hidden = !session.legacy.warning;
  warning.textContent = session.legacy.warning
    ? "بخشی از تنظیمات قدیمی مرورگر ناقص یا متعارض بود. مشخصات معتبر حفظ شده است؛ برای ادامهٔ ارسال‌های قبلی، کد همین مدرسه و فرستنده را از فایل قبلی بررسی کنید."
    : "";
}

function fillDeputyExportSchool(session) {
  const node = (name) => session.panel.querySelector('[name="' + name + '"]');
  const school = deputyExportSavedSchool(session);
  node("deputySchoolCode").value =
    typeof school?.code === "string" ? school.code : "";
  node("deputyChangeIdentity").checked = false;
  if (
    !session.identity &&
    !session.legacy.sender?.name &&
    (!node("deputySenderName").value ||
      node("deputySenderName").value === session.suggestedName)
  ) {
    session.suggestedName = deputyExportSuggestedName(
      session.parts,
      node("deputySchool").value,
    );
    node("deputySenderName").value = session.suggestedName;
  }
  deputyExportIdentityPresentation(session, { resetOpen: true });
}

function initializeDeputyExportIdentity(session) {
  const node = (name) => session.panel.querySelector('[name="' + name + '"]'),
    sender = session.identity?.sender || session.legacy.sender;
  node("deputySenderName").value =
    typeof sender?.name === "string" ? sender.name : "";
  node("deputySenderCode").value =
    typeof sender?.code === "string" ? sender.code : "";
  node("deputyIdentityMode").value = sender?.code ? "existing" : "";
  fillDeputyExportSchool(session);
  node("deputySchool").addEventListener("change", () =>
    fillDeputyExportSchool(session),
  );
  node("deputyIdentityMode").addEventListener("change", () => {
    if (session.identity || session.legacy.sender?.code) return;
    if (node("deputyIdentityMode").value === "new") {
      session.generatedCode ||= "TEACHER-" + uid().toUpperCase();
      node("deputySenderCode").value = session.generatedCode;
    } else {
      node("deputySenderCode").value = "";
      session.panel.querySelector("[data-deputy-identity-advanced]").open =
        true;
    }
    deputyExportIdentityPresentation(session);
  });
  node("deputyChangeIdentity").addEventListener("change", () =>
    deputyExportIdentityPresentation(session),
  );
  session.panel.addEventListener("input", () =>
    deputyExportIdentityPresentation(session),
  );
  session.panel.addEventListener(
    "invalid",
    (event) => {
      let details = event.target.closest?.("details");
      while (details) {
        details.open = true;
        details = details.parentElement?.closest("details");
      }
    },
    true,
  );
}
