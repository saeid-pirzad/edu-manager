// Deputy exchange is a selected-school, whole-year projection, never a backup.
// Only an explicitly previewed packet can be downloaded; no teacher data is changed.
let deputyExportSession = null;
const deputyExportPreferencesKey = "EduDeputy.teacherExport.v1";

function readDeputyExportPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(deputyExportPreferencesKey));
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : {};
  } catch {
    return {};
  }
}

function deputyExportFields(session) {
  const value = (name) =>
    session.panel.querySelector('[name="' + name + '"]').value;
  return {
    schoolId: value("deputySchool"),
    schoolCode: value("deputySchoolCode"),
    sender: {
      code: value("deputySenderCode"),
      name: value("deputySenderName"),
    },
  };
}

function deputyExportSignature(session) {
  return JSON.stringify(deputyExportFields(session));
}

function checkDeputyExport(session) {
  assertWorkspaceReadable();
  if (
    !session ||
    deputyExportSession !== session ||
    !session.panel.isConnected ||
    document.getElementById("modal").classList.contains("hidden") ||
    workspace.id !== session.workspace ||
    connection !== session.connection ||
    reportCopyScope() !== session.scope
  )
    throw Error(
      "صفحه یا پنجرهٔ ارسال تغییر کرده است؛ فایل معاون را دوباره آماده کنید.",
    );
  if (session.context) assertWorkspaceContext(session.context);
}

function deputyExportMessage(session, text, { error = false } = {}) {
  if (deputyExportSession !== session || !session.panel.isConnected) return;
  session.panel.querySelector("[data-deputy-export-status]").textContent = error
    ? ""
    : text;
  session.panel.querySelector("[data-deputy-export-error]").textContent = error
    ? text
    : "";
}

function clearDeputyExportPreview(session) {
  session.prepared = null;
  const preview = session.panel.querySelector("[data-deputy-export-preview]");
  preview.hidden = true;
  preview.textContent = "";
  session.panel.querySelector(
    '[data-workspace-action="export-deputy-packet"]',
  ).hidden = true;
}

async function openDeputyExport(schoolId = "") {
  assertWorkspaceReadable();
  const requestedSchool = schoolId || state.schoolId || "";
  const opened = showModal(
    "فایل کارتابل معاون",
    '<form id="deputyExportPanel" class="record-editor" data-workspace-submit="prepare-deputy-packet"><div class="record-editor-context"><h4>ارسال اطلاعات یک مدرسه</h4><p>این فایل همهٔ اطلاعات ثبت‌شدهٔ مدرسهٔ انتخابی را در ترم اول و دوم همین سال دارد؛ محدودیت تاریخ و کلاس گزارش روی آن اعمال نمی‌شود.</p></div>' +
      '<p class="muted">معاون فقط اطلاعات را می‌بیند و پیگیری ثبت می‌کند؛ نمی‌تواند حضور یا نمرهٔ دبیر را تغییر دهد. این فایل پشتیبان نیست و دانلود آن به معنی ارسال آنلاین نیست.</p>' +
      '<fieldset data-deputy-export-fields disabled><label class="course-field">مدرسه<select name="deputySchool" id="deputySchool" required aria-describedby="deputyExportError"><option value="">انتخاب مدرسه</option></select></label>' +
      '<label class="course-field">کد مشترک مدرسه<input name="deputySchoolCode" id="deputySchoolCode" required maxlength="64" dir="ltr" autocomplete="off" spellcheck="false" aria-describedby="deputyIdentityHint deputyExportError"></label>' +
      '<label class="course-field">نام دبیر / فرستنده<input name="deputySenderName" id="deputySenderName" required maxlength="200" autocomplete="name" aria-describedby="deputyExportError"></label>' +
      '<label class="course-field">کد ثابت دبیر / فرستنده<input name="deputySenderCode" id="deputySenderCode" required maxlength="64" dir="ltr" autocomplete="off" spellcheck="false" aria-describedby="deputyIdentityHint deputyExportError"></label>' +
      '<p id="deputyIdentityHint" class="muted">کد مدرسه را با معاون هماهنگ کنید؛ هر دبیر کد ثابت و متفاوت خودش را داشته باشد. برای ارسال‌های بعد همان کدها را نگه دارید. کد با حرف انگلیسی یا عدد شروع می‌شود؛ خط تیره و زیرخط هم مجازند. فایل امضای دیجیتال ندارد؛ اصالت فرستنده باید جداگانه تأیید شود.</p>' +
      '<label><input type="checkbox" name="deputyConsent" required> فایل شامل نام هنرجویان، حضور و نمره‌هاست و رمزگذاری نشده؛ آن را فقط به معاون مورداعتماد می‌فرستم.</label>' +
      '<label><input type="checkbox" name="deputyRemember"> مشخصات فرستنده و کد این مدرسه در همین دستگاه نگه داشته شود.</label></fieldset>' +
      '<section class="record-editor-context" data-deputy-export-preview hidden aria-label="پیش‌نمایش اطلاعات فایل"></section><p data-deputy-export-status role="status" aria-live="polite">در حال بررسی اطلاعات ثبت‌شدهٔ سال…</p><p id="deputyExportError" data-deputy-export-error role="alert"></p>' +
      '<div class="record-editor-actions"><button type="submit" data-deputy-export-prepare disabled>بررسی و آماده‌سازی فایل</button><button type="button" class="success" data-workspace-action="export-deputy-packet" hidden>دریافت فایل معاون</button><button type="button" class="ghost" data-workspace-action="close">بستن</button></div><p class="muted">فایل دریافت‌شده را برای معاون مورداعتماد بفرستید؛ معاون آن را در برنامهٔ مستقل خودش، بخش «دریافت اطلاعات»، وارد می‌کند.</p></form>',
  );
  if (opened === false) return false;
  const session = {
    panel: document.getElementById("deputyExportPanel"),
    workspace: workspace.id,
    connection,
    scope: reportCopyScope(),
    context: null,
    parts: null,
    prepared: null,
    preparing: false,
    exporting: false,
  };
  deputyExportSession = session;
  const modal = document.getElementById("modal"),
    observer = new MutationObserver(() => {
      if (!session.panel.isConnected || modal.classList.contains("hidden")) {
        session.parts = null;
        session.prepared = null;
        if (deputyExportSession === session) deputyExportSession = null;
        observer.disconnect();
      }
    });
  observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
  observer.observe(document.getElementById("modalBody"), { childList: true });
  try {
    const snapshot = await prepareReportSnapshot({ yearWide: true });
    checkDeputyExport(session);
    session.context = snapshot.context;
    session.parts = snapshot.parts;
    await assertReportSnapshot(session.context);
    checkDeputyExport(session);
    const schools = new Map();
    for (const part of session.parts)
      for (const school of part.data.schools) schools.set(school.id, school);
    const select = session.panel.querySelector('[name="deputySchool"]');
    select.innerHTML =
      '<option value="">انتخاب مدرسه</option>' +
      [...schools.values()]
        .map(
          (school) =>
            '<option value="' +
            esc(school.id) +
            '">' +
            esc(school.name) +
            "</option>",
        )
        .join("");
    select.value = schools.has(requestedSchool) ? requestedSchool : "";
    const preferences = readDeputyExportPreferences();
    if (typeof preferences.sender?.name === "string")
      session.panel.querySelector('[name="deputySenderName"]').value =
        preferences.sender.name.slice(0, 200);
    if (typeof preferences.sender?.code === "string")
      session.panel.querySelector('[name="deputySenderCode"]').value =
        preferences.sender.code.slice(0, 64);
    const fillSchoolCode = () => {
      const saved = Array.isArray(preferences.schools)
        ? preferences.schools.find(
            (row) => row?.year === workspace.year && row.id === select.value,
          )
        : null;
      session.panel.querySelector('[name="deputySchoolCode"]').value =
        typeof saved?.code === "string" ? saved.code.slice(0, 64) : "";
    };
    fillSchoolCode();
    select.addEventListener("change", fillSchoolCode);
    const invalidate = () => {
      if (
        session.prepared &&
        (deputyExportSignature(session) !== session.prepared.signature ||
          !session.panel.querySelector('[name="deputyConsent"]').checked)
      ) {
        clearDeputyExportPreview(session);
        deputyExportMessage(
          session,
          "مشخصات تغییر کرد؛ فایل را دوباره بررسی و آماده کنید.",
        );
      }
    };
    session.panel.addEventListener("input", invalidate);
    session.panel.addEventListener("change", invalidate);
    session.panel.querySelector("[data-deputy-export-fields]").disabled = false;
    session.panel.querySelector("[data-deputy-export-prepare]").disabled =
      false;
    deputyExportMessage(
      session,
      "مدرسه و مشخصات فرستنده را بررسی کنید؛ پیش از دانلود، محدوده و تعداد اطلاعات نشان داده می‌شود.",
    );
    return true;
  } catch (error) {
    deputyExportMessage(session, error.message, { error: true });
    return false;
  }
}

async function prepareDeputyPacket() {
  const session = deputyExportSession;
  if (!session || session.preparing || session.exporting) return false;
  session.preparing = true;
  const finish = beginRecordEditorSave(session.panel);
  try {
    checkDeputyExport(session);
    clearDeputyExportPreview(session);
    if (!session.context || !session.parts)
      throw Error(
        "اطلاعات سال هنوز آماده نیست؛ پنجرهٔ ارسال را دوباره باز کنید.",
      );
    const fields = deputyExportFields(session),
      signature = deputyExportSignature(session);
    if (!session.panel.querySelector('[name="deputyConsent"]').checked)
      throw Error(
        "پیش از آماده‌سازی، محرمانگی اطلاعات و گیرنده را تأیید کنید.",
      );
    await assertReportSnapshot(session.context);
    checkDeputyExport(session);
    if (
      signature !== deputyExportSignature(session) ||
      !session.panel.querySelector('[name="deputyConsent"]').checked
    )
      throw Error("مشخصات هنگام آماده‌سازی تغییر کرد؛ دوباره تلاش کنید.");
    const packet = EduDeputyExchange.build({ ...fields, parts: session.parts }),
      counts = EduDeputyExchange.plan(null, packet).counts;
    session.prepared = { packet, signature };
    const preview = session.panel.querySelector("[data-deputy-export-preview]");
    preview.innerHTML =
      "<h4>" +
      esc(packet.school.name) +
      " · " +
      esc(packet.academicYear) +
      "</h4><p>فرستنده: " +
      esc(packet.sender.name) +
      " · کد دبیر: " +
      esc(packet.sender.code) +
      " · کد مدرسه: " +
      esc(packet.school.code) +
      "</p><p>" +
      [
        ["ترم", counts.periods],
        ["کلاس", counts.classes],
        ["هنرجو در کلاس", counts.students],
        ["درس", counts.lessons],
        ["جلسه", counts.sessions],
        ["فعالیت", counts.activities],
      ]
        .map(([label, count]) => count.toLocaleString("fa-IR") + " " + label)
        .join(" · ") +
      "</p><p>فقط همین مدرسه و ترم‌های شروع‌شدهٔ همین سال؛ شامل هنرجویان بایگانی‌شده، نمره‌های ثبت‌شده و جلسات داخل بازهٔ همین سال تحصیلی. جلسات خارج از این سال، رمزها، تنظیمات، پیش‌نویس‌ها، پشتیبان‌ها و مدارس دیگر در فایل نیستند.</p>" +
      "<details><summary>نسخهٔ اطلاعات ارسالی</summary><p>" +
      packet.periods
        .map(
          (period) =>
            (period.termKind === "first" ? "ترم اول" : "ترم دوم") +
            " · نسخهٔ " +
            period.revision.toLocaleString("fa-IR"),
        )
        .join(" | ") +
      "</p><p>برای به‌روزرسانی همان پرونده، کد مدرسه و کد دبیر را ثابت نگه دارید. معاون نسخهٔ اطلاعات را بررسی می‌کند؛ نام فایل یا زمان دانلود به‌تنهایی نشانهٔ جدیدبودن نیست.</p></details>";
    preview.hidden = false;
    session.panel.querySelector(
      '[data-workspace-action="export-deputy-packet"]',
    ).hidden = false;
    deputyExportMessage(
      session,
      "فایل بررسی شد؛ اگر محدوده و فرستنده درست است، «دریافت فایل معاون» را بزنید.",
    );
    return structuredClone(packet);
  } catch (error) {
    clearDeputyExportPreview(session);
    deputyExportMessage(session, error.message, { error: true });
    return false;
  } finally {
    session.preparing = false;
    finish();
  }
}

async function exportDeputyPacket() {
  const session = deputyExportSession;
  if (!session || session.preparing || session.exporting) return false;
  session.exporting = true;
  const finish = beginRecordEditorSave(session.panel);
  try {
    checkDeputyExport(session);
    const prepared = session.prepared;
    if (!prepared) throw Error("ابتدا فایل معاون را بررسی و آماده کنید.");
    await assertReportSnapshot(session.context);
    checkDeputyExport(session);
    if (
      prepared !== session.prepared ||
      prepared.signature !== deputyExportSignature(session) ||
      !session.panel.querySelector('[name="deputyConsent"]').checked
    )
      throw Error(
        "مشخصات یا تأیید ارسال تغییر کرده؛ فایل را دوباره آماده کنید.",
      );
    const packet = EduDeputyExchange.validate(prepared.packet);
    checkDeputyExport(session);
    // The final context/selection checks are immediately before download.
    downloadJSON(
      packet,
      "edu-deputy-" +
        packet.school.code +
        "-" +
        packet.sender.code +
        "-" +
        packet.academicYear +
        "-" +
        packet.exportedAt.slice(0, 19).replace(/\D/g, "") +
        "Z.json",
      { compact: true },
    );
    if (session.panel.querySelector('[name="deputyRemember"]').checked) {
      try {
        const previous = readDeputyExportPreferences(),
          schools = (Array.isArray(previous.schools) ? previous.schools : [])
            .filter(
              (row) =>
                row &&
                typeof row.id === "string" &&
                typeof row.year === "string" &&
                typeof row.code === "string" &&
                !(
                  row.id === packet.school.id &&
                  row.year === packet.academicYear
                ),
            )
            .slice(-99);
        schools.push({
          year: packet.academicYear,
          id: packet.school.id,
          code: packet.school.code,
        });
        localStorage.setItem(
          deputyExportPreferencesKey,
          JSON.stringify({ sender: packet.sender, schools }),
        );
      } catch {
        // Remembering non-secret form defaults is optional; download still works.
      }
    }
    deputyExportMessage(
      session,
      "دریافت فایل درخواست شد؛ ذخیرهٔ فایل را بررسی کنید و آن را به‌صورت پیوست برای معاون بفرستید. اطلاعات برنامه تغییر نکرد و هیچ ارسال آنلاینی انجام نشد.",
    );
    return structuredClone(packet);
  } catch (error) {
    deputyExportMessage(session, error.message, { error: true });
    return false;
  } finally {
    session.exporting = false;
    finish();
  }
}
