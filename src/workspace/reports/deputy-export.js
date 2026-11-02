// Deputy exchange is a selected-school, whole-year projection, never a backup.
// Only an explicitly previewed packet can be downloaded. Educational data is
// unchanged; the sender's one-time setup is persisted separately and backed up.
let deputyExportSession = null;
const deputyExportPreferencesKey = "EduDeputy.teacherExport.v1";

function readDeputyExportPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(deputyExportPreferencesKey));
    if (saved == null) return {};
    if (typeof saved !== "object" || Array.isArray(saved))
      return { warning: true };
    const rows = Array.isArray(saved.schools) ? saved.schools : [],
      valid = new Map(),
      ids = new Map(),
      codes = new Map();
    let warning = saved.schools != null && !Array.isArray(saved.schools);
    if (rows.length > 10000) warning = true;
    for (const row of rows.slice(-10000)) {
      try {
        const school = EduDeputyExportIdentity.normalize({
            version: 1,
            token: "legacy",
            sender: { name: "legacy", code: "LEGACY" },
            schools: [{ year: row.year, id: row.id, code: row.code }],
          }).schools[0],
          id = JSON.stringify([school.year, school.id]),
          code = JSON.stringify([school.year, school.code]);
        if (!ids.has(id)) ids.set(id, new Set());
        if (!codes.has(code)) codes.set(code, new Set());
        ids.get(id).add(school.code);
        codes.get(code).add(school.id);
        valid.set(
          JSON.stringify([school.year, school.id, school.code]),
          school,
        );
      } catch {
        warning = true;
      }
    }
    const schools = [...valid.values()].filter((school) => {
      const unique =
        ids.get(JSON.stringify([school.year, school.id])).size === 1 &&
        codes.get(JSON.stringify([school.year, school.code])).size === 1;
      if (!unique) warning = true;
      return unique;
    });
    return {
      sender: {
        name: typeof saved.sender?.name === "string" ? saved.sender.name : "",
        code: typeof saved.sender?.code === "string" ? saved.sender.code : "",
      },
      schools,
      warning,
    };
  } catch {
    return { warning: true };
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

async function checkDeputyExportIdentity(session) {
  const current = await readDeputyExportIdentity({
    check: () => checkDeputyExport(session),
    validateCatalog: (catalog) => checkDeputyExportCatalog(session, catalog),
  });
  if ((current?.token || null) !== (session.identity?.token || null))
    throw Error(
      "مشخصات ارسال در پنجرهٔ دیگری تغییر کرده است؛ ارسال به معاون را دوباره باز کنید.",
    );
}

function checkDeputyExportCatalog(session, catalog) {
  checkDeputyExport(session);
  assertReportCatalogSnapshot(session.context, catalog);
  if (busy || drafts.size || assessmentContext.hasDrafts())
    throw Error(
      "ثبت یا ویرایش ناتمام وجود دارد؛ فایل را پس از ذخیره دوباره تهیه کنید.",
    );
}

function deputyExportPreparationGuard(session, signature) {
  checkDeputyExport(session);
  if (
    signature !== deputyExportSignature(session) ||
    !session.panel.querySelector('[name="deputyConsent"]').checked
  )
    throw Error("مشخصات یا تأیید ارسال تغییر کرد؛ فایل را دوباره آماده کنید.");
}

async function persistDeputyExportSetup(session, packet, signature) {
  const known = session.identity?.sender || session.legacy.sender,
    school = deputyExportSavedSchool(session),
    priorCode = (value) => {
      if (typeof value !== "string") return "";
      try {
        return EduDeputyExportIdentity.code(value);
      } catch {
        return value.trim();
      }
    },
    changedCodes =
      (known?.code && priorCode(known.code) !== packet.sender.code) ||
      (school?.code && priorCode(school.code) !== packet.school.code);
  if (
    changedCodes &&
    (!session.panel.querySelector('[name="deputyChangeIdentity"]').checked ||
      !confirm(
        "کدهای ارسال تغییر می‌کنند:\nمدرسه: " +
          (priorCode(school?.code) || "ثبت‌نشده") +
          " ← " +
          packet.school.code +
          "\nفرستنده: " +
          (priorCode(known?.code) || "ثبت‌نشده") +
          " ← " +
          packet.sender.code +
          "\nاین تغییر ممکن است در کارتابل معاون پروندهٔ تازه بسازد و به‌روزرسانی پروندهٔ قبلی محسوب نشود. تغییر کدها را تأیید می‌کنید؟",
      ))
  )
    throw Error("تغییر کدهای ثبت‌شده تأیید نشد؛ کدهای قبلی را نگه دارید.");
  const schools = [
      ...(session.identity?.schools || session.legacy.schools || []),
    ],
    schoolIndex = schools.findIndex(
      (row) => row.year === session.year && row.id === packet.school.id,
    ),
    schoolIdentity = {
      year: session.year,
      id: packet.school.id,
      code: packet.school.code,
    };
  if (schoolIndex < 0) schools.push(schoolIdentity);
  else schools[schoolIndex] = schoolIdentity;
  const candidate = EduDeputyExportIdentity.normalize({
    version: 1,
    token: session.identity?.token || "pending",
    sender: packet.sender,
    schools,
  });
  if (JSON.stringify(candidate) !== JSON.stringify(session.identity)) {
    session.identity = await saveDeputyExportIdentity(candidate, {
      expectedToken: session.identity?.token || null,
      check: () => deputyExportPreparationGuard(session, signature),
      validateCatalog: (catalog) => checkDeputyExportCatalog(session, catalog),
    });
    if (typeof scheduleSingleFile === "function") scheduleSingleFile();
  }
  // Durable identity wins from this point. Never re-import stale device-only
  // defaults after backup restore or when another window changes the profile.
  session.legacy = {};
  try {
    localStorage.removeItem(deputyExportPreferencesKey);
  } catch {}
  deputyExportPreparationGuard(session, signature);
  deputyExportIdentityPresentation(session, { resetOpen: true });
}

function deputyExportMessage(session, text, { error = false } = {}) {
  if (deputyExportSession !== session || !session.panel.isConnected) return;
  session.panel.querySelector("[data-deputy-export-status]").textContent = error
    ? ""
    : text;
  session.panel.querySelector("[data-deputy-export-error]").textContent = error
    ? text
    : "";
  if (error)
    session.panel.querySelector("[data-deputy-export-identity]").open = true;
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
  const opened = showModal("فایل کارتابل معاون", deputyExportPanelMarkup());
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
    identity: null,
    legacy: {},
    year: workspace.year,
    suggestedName: "",
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
    select.value = schools.has(requestedSchool)
      ? requestedSchool
      : schools.size === 1
        ? [...schools.keys()][0]
        : "";
    session.identity = await readDeputyExportIdentity({
      check: () => checkDeputyExport(session),
      validateCatalog: (catalog) => checkDeputyExportCatalog(session, catalog),
    });
    if (!session.identity) session.legacy = readDeputyExportPreferences();
    initializeDeputyExportIdentity(session);
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
      session.identity
        ? "مشخصات ارسال آماده است؛ گیرنده را تأیید و فایل را آماده کنید."
        : "مشخصات ارسال را یک‌بار تأیید کنید؛ برای ارسال‌های بعد در برنامه و پشتیبان محفوظ می‌ماند.",
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
    if (
      !session.identity &&
      !session.legacy.sender?.code &&
      !["new", "existing"].includes(
        session.panel.querySelector('[name="deputyIdentityMode"]').value,
      )
    )
      throw Error("مشخص کنید این اولین ارسال شماست یا ادامهٔ فایل‌های قبلی.");
    if (!session.panel.querySelector('[name="deputyConsent"]').checked)
      throw Error(
        "پیش از آماده‌سازی، محرمانگی اطلاعات و گیرنده را تأیید کنید.",
      );
    await assertReportSnapshot(session.context);
    await checkDeputyExportIdentity(session);
    checkDeputyExport(session);
    if (
      signature !== deputyExportSignature(session) ||
      !session.panel.querySelector('[name="deputyConsent"]').checked
    )
      throw Error("مشخصات هنگام آماده‌سازی تغییر کرد؛ دوباره تلاش کنید.");
    const packet = EduDeputyExchange.build({ ...fields, parts: session.parts }),
      counts = EduDeputyExchange.plan(null, packet).counts;
    await persistDeputyExportSetup(session, packet, signature);
    await checkDeputyExportIdentity(session);
    deputyExportPreparationGuard(session, signature);
    session.prepared = { packet, signature };
    const preview = session.panel.querySelector("[data-deputy-export-preview]");
    preview.innerHTML =
      "<h4>" +
      esc(packet.school.name) +
      " · " +
      esc(packet.academicYear) +
      "</h4><p>فرستنده: " +
      esc(packet.sender.name) +
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
    await checkDeputyExportIdentity(session);
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
    deputyExportMessage(
      session,
      "دریافت فایل درخواست شد؛ ذخیرهٔ فایل را بررسی کنید و آن را به‌صورت پیوست برای معاون بفرستید. اطلاعات آموزشی تغییر نکرد و هیچ ارسال آنلاینی انجام نشد.",
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
