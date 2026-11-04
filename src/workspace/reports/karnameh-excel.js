// Excel is prepared from a fresh annual snapshot, independently of the visible stage.
let karnamehExcelDialog = null;

function karnamehExcelFilename({ classroom, studentId, year, generatedAt }) {
  const clean = (value) =>
    Array.from(String(value || ""), (character) =>
      character.charCodeAt(0) < 32 ||
      character.charCodeAt(0) === 127 ||
      '\\/:*?"<>|'.includes(character)
        ? "-"
        : character,
    )
      .join("")
      .trim()
      .slice(0, 55)
      .replace(/[. ]+$/g, "") || "نمرات";
  const teachers = [
    ...new Set(
      classroom.lessons
        .map((lesson) => String(lesson.teacher || "").trim())
        .filter(Boolean),
    ),
  ];
  const teacher =
    teachers.length === 1 ? teachers[0] : teachers.length ? "چند دبیر" : "دبیر";
  const student = studentId
    ? karnamehReportStudents(classroom).find((item) => item.id === studentId)
    : null;
  if (studentId && !student)
    throw Error("هنرجوی انتخاب‌شده در کلاس موجود نیست.");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Tehran",
    })
      .formatToParts(new Date(generatedAt))
      .map((part) => [part.type, part.value]),
  );
  const stamp =
    parts.year +
    "-" +
    parts.month +
    "-" +
    parts.day +
    "_" +
    parts.hour +
    "-" +
    parts.minute +
    "-" +
    parts.second;
  return (
    clean(teacher) +
    "_" +
    stamp +
    "_نمرات-" +
    (student ? clean(student.name) : "کل-کلاس-" + clean(classroom.name)) +
    "_" +
    clean(year) +
    ".xlsx"
  );
}

function assertKarnamehExcelDialog(session) {
  assertWorkspaceReadable();
  if (
    !session ||
    karnamehExcelDialog !== session ||
    connection !== session.connection ||
    installationToken !== session.installation ||
    workspace.id !== session.workspaceId ||
    workspace.year !== session.year ||
    state.view !== "reports" ||
    state.reportTab !== "karnameh" ||
    JSON.stringify(karnamehFilter) !== session.selection ||
    !session.entry.isConnected ||
    !session.panel?.isConnected ||
    document.getElementById("karnamehExcelPanel") !== session.panel ||
    document.getElementById("modal").classList.contains("hidden")
  )
    throw Error(
      "کارنامه یا اطلاعات برنامه تغییر کرده است؛ پنجرهٔ اکسل را دوباره باز کنید.",
    );
}

function openKarnamehExcel(button) {
  assertWorkspaceReadable();
  const found = findClassById(karnamehFilter.classId);
  if (
    !button?.isConnected ||
    state.view !== "reports" ||
    state.reportTab !== "karnameh" ||
    !found ||
    (karnamehFilter.schoolId && found.school.id !== karnamehFilter.schoolId)
  )
    throw Error("ابتدا مدرسه و کلاس کارنامه را انتخاب کنید.");
  const students = karnamehReportStudents(found.classObj);
  if (!students.length) throw Error("در کلاس انتخاب‌شده هنرجویی وجود ندارد.");
  const student = students.find((item) => item.id === karnamehFilter.studentId);
  if (karnamehFilter.studentId && !student)
    throw Error("هنرجوی انتخاب‌شده در کلاس موجود نیست.");
  const session = {
    connection,
    installation: installationToken,
    workspaceId: workspace.id,
    year: workspace.year,
    selection: JSON.stringify(karnamehFilter),
    schoolId: found.school.id,
    classId: found.classObj.id,
    studentId: student?.id || "",
    entry: button,
    panel: null,
    working: false,
    delivery: "download",
    prepared: null,
  };
  const choice = (scope, title, detail, icon, disabled = false) =>
    '<button type="button" class="ghost" data-workspace-action="karnameh-excel-download" data-scope="' +
    scope +
    '"' +
    (disabled ? " disabled" : "") +
    '><span class="karnameh-excel-choice-icon" aria-hidden="true">' +
    EduIcons.html(icon) +
    '</span><span class="karnameh-excel-choice-copy"><strong>' +
    esc(title) +
    "</strong><small>" +
    esc(detail) +
    '</small></span><span class="karnameh-excel-choice-end" aria-hidden="true">' +
    EduIcons.html("download") +
    "</span></button>";
  const opened = showModal(
    "خروجی اکسل نمرات",
    '<section class="karnameh-excel-dialog" id="karnamehExcelPanel"><div class="karnameh-excel-heading"><span class="karnameh-excel-choice-icon" aria-hidden="true">' +
      EduIcons.html("grades") +
      "</span><div><h4>نمرات سال تحصیلی</h4><p>" +
      esc(
        [found.school.name, found.classObj.name, workspace.year].join(" · "),
      ) +
      '</p></div></div><p class="karnameh-excel-description">همهٔ مراحل و پودمان‌های همین سال در فایل قرار می‌گیرند؛ نمرهٔ ثبت‌نشده خالی می‌ماند.</p><div class="karnameh-excel-delivery" aria-label="روش دریافت اکسل"><button type="button" class="ghost" data-workspace-action="karnameh-excel-mode" data-delivery="download" aria-pressed="true">دریافت فایل</button><button type="button" class="ghost" data-workspace-action="karnameh-excel-mode" data-delivery="share" aria-pressed="false">ارسال در پیام‌رسان</button></div><div class="karnameh-excel-choices">' +
      choice(
        "student",
        "اکسل هنرجوی انتخاب‌شده",
        student?.name || "ابتدا یک هنرجو انتخاب کنید.",
        "grades",
        !student,
      ) +
      choice(
        "class",
        "اکسل نمرات کل کلاس",
        karnamehSheetNumber(students.length) + " هنرجو · فعال و بایگانی",
        "users",
      ) +
      '</div><p data-karnameh-excel-status role="status" aria-live="polite"></p><section class="karnameh-excel-ready" data-karnameh-excel-ready hidden><strong data-karnameh-excel-file dir="auto"></strong><span data-karnameh-excel-file-size></span><div class="karnameh-excel-ready-actions"><button type="button" data-workspace-action="karnameh-excel-send" hidden disabled>' +
      EduIcons.html("share") +
      '<span>انتخاب پیام‌رسان و ارسال</span></button><button type="button" class="ghost" data-workspace-action="karnameh-excel-save" disabled>' +
      EduIcons.html("download") +
      "<span>دریافت فایل برای پیوست</span></button></div></section></section>",
  );
  if (opened === false) return false;
  session.panel = document.getElementById("karnamehExcelPanel");
  clearPreparedKarnamehExcel(karnamehExcelDialog);
  karnamehExcelDialog = session;
  if (typeof MutationObserver === "function") {
    const modal = document.getElementById("modal");
    const observer = new MutationObserver(() => {
      if (!session.panel.isConnected || modal.classList.contains("hidden")) {
        clearPreparedKarnamehExcel(session);
        if (karnamehExcelDialog === session) karnamehExcelDialog = null;
        observer.disconnect();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.getElementById("modalBody"), { childList: true });
  }
  return true;
}

async function downloadKarnamehExcel(button) {
  const session = karnamehExcelDialog;
  if (!session || session.working) return false;
  const status = session.panel.querySelector("[data-karnameh-excel-status]");
  let unlock = () => {};
  try {
    assertKarnamehExcelDialog(session);
    const scope = button.dataset.scope;
    if (
      !button.isConnected ||
      button.closest("#karnamehExcelPanel") !== session.panel ||
      !["student", "class"].includes(scope) ||
      (scope === "student" && !session.studentId) ||
      button.disabled
    )
      throw Error(
        "محدودهٔ خروجی معتبر نیست؛ کلاس یا هنرجو را دوباره انتخاب کنید.",
      );
    clearPreparedKarnamehExcel(session);
    unlock = lockKarnamehExcel(session);
    status.dataset.state = "working";
    status.textContent = "در حال آماده‌سازی اکسل نمرات…";
    const snapshot = await prepareKarnamehSnapshot();
    assertKarnamehExcelDialog(session);
    const active = snapshot.parts.find(
      (part) => part.period.id === session.workspaceId,
    );
    const school = active?.data.schools.find(
      (item) => item.id === session.schoolId,
    );
    const classroom = school?.classes.find(
      (item) => item.id === session.classId,
    );
    if (!classroom)
      throw Error("کلاس انتخاب‌شده در اطلاعات سال تحصیلی موجود نیست.");
    assertAnnualLessonCompatibility(snapshot.parts, school.id, classroom.id);
    const merged = {
      ...classroom,
      lessons: karnamehLessons(snapshot.parts, school.id, classroom),
    };
    if (!merged.lessons.length)
      throw Error("هنوز درسی برای خروجی نمرات این کلاس تعریف نشده است.");
    const studentId = scope === "student" ? session.studentId : "";
    const generatedAt = new Date().toISOString();
    const sheets = karnamehExcelSheets({
      parts: snapshot.parts,
      schoolId: school.id,
      classroom: merged,
      studentId,
      year: session.year,
      generatedAt,
    });
    const blob = window.EduPeriodicReports.createWorkbook(sheets);
    const name = karnamehExcelFilename({
      classroom: merged,
      studentId,
      year: session.year,
      generatedAt,
    });
    await assertReportSnapshot(snapshot.context);
    assertKarnamehExcelDialog(session);
    if (session.delivery === "share") {
      showPreparedKarnamehExcel(session, {
        context: snapshot.context,
        blob,
        name,
      });
    } else {
      downloadLocalFile(blob, name);
      status.dataset.state = "saved";
      status.textContent =
        scope === "student"
          ? "فایل اکسل نمرات هنرجوی انتخاب‌شده برای دریافت به مرورگر تحویل داده شد."
          : "فایل اکسل نمرات کل کلاس برای دریافت به مرورگر تحویل داده شد.";
    }
    return true;
  } catch (error) {
    if (karnamehExcelDialog === session && session.panel.isConnected) {
      status.dataset.state = "error";
      status.textContent = error.message || String(error);
    }
    return false;
  } finally {
    unlock();
  }
}

function karnamehExcelMessage(session, message, state = "ready") {
  if (karnamehExcelDialog !== session || !session.panel.isConnected) return;
  const status = session.panel.querySelector("[data-karnameh-excel-status]");
  status.textContent = message;
  status.dataset.state = state;
}

function clearPreparedKarnamehExcel(session, message = "") {
  if (!session) return;
  if (session.prepared) {
    session.prepared.invalid = true;
    session.prepared.file = null;
    session.prepared.blob = null;
    session.prepared = null;
  }
  if (!session.panel?.isConnected) return;
  const ready = session.panel.querySelector("[data-karnameh-excel-ready]");
  if (ready) ready.hidden = true;
  for (const action of ["karnameh-excel-send", "karnameh-excel-save"]) {
    const button = session.panel.querySelector(
      '[data-workspace-action="' + action + '"]',
    );
    if (button) button.disabled = true;
  }
  if (message) karnamehExcelMessage(session, message, "error");
}

function invalidateKarnamehExcelShare(message) {
  const session = karnamehExcelDialog;
  const prepared = session?.prepared;
  if (!prepared || !message?.workspace) return;
  const member = prepared.context.members?.find(
    (item) => item.id === message.workspace,
  );
  if (
    message.type === "period-deleted" ||
    (Number.isSafeInteger(message.revision) &&
      message.revision > 0 &&
      (!member || message.revision > member.revision))
  )
    clearPreparedKarnamehExcel(
      session,
      "اطلاعات نمرات تغییر کرده است؛ کلاس یا هنرجو را بزنید تا فایل تازه آماده شود.",
    );
}

function lockKarnamehExcel(session) {
  const buttons = [
    ...session.panel.querySelectorAll("button[data-scope]"),
    ...session.panel.querySelectorAll("button[data-delivery]"),
    session.panel.querySelector(
      '[data-workspace-action="karnameh-excel-send"]',
    ),
    session.panel.querySelector(
      '[data-workspace-action="karnameh-excel-save"]',
    ),
  ].filter(Boolean);
  const disabled = buttons.map((button) => button.disabled);
  session.working = true;
  session.panel.setAttribute("aria-busy", "true");
  buttons.forEach((button) => {
    button.disabled = true;
  });
  return () => {
    session.working = false;
    session.panel.removeAttribute("aria-busy");
    buttons.forEach((button, index) => {
      button.disabled = disabled[index];
    });
    const ready = !!session.prepared && !session.prepared.invalid;
    for (const action of ["karnameh-excel-send", "karnameh-excel-save"]) {
      const button = session.panel.querySelector(
        '[data-workspace-action="' + action + '"]',
      );
      if (button) button.disabled = !ready;
    }
  };
}

function setKarnamehExcelDelivery(button) {
  const session = karnamehExcelDialog;
  if (!session || session.working) return false;
  assertKarnamehExcelDialog(session);
  const delivery = button.dataset.delivery;
  if (
    !button.isConnected ||
    button.closest("#karnamehExcelPanel") !== session.panel ||
    !["download", "share"].includes(delivery)
  )
    return false;
  clearPreparedKarnamehExcel(session);
  session.delivery = delivery;
  for (const option of session.panel.querySelectorAll("button[data-delivery]"))
    option.setAttribute(
      "aria-pressed",
      String(option.dataset.delivery === delivery),
    );
  for (const choice of session.panel.querySelectorAll("button[data-scope]")) {
    const icon = choice.querySelector(".karnameh-excel-choice-end");
    if (icon)
      icon.innerHTML = EduIcons.html(
        delivery === "share" ? "share" : "download",
      );
  }
  karnamehExcelMessage(
    session,
    delivery === "share"
      ? "هنرجو یا کل کلاس را انتخاب کنید؛ پس از آماده‌شدن فایل، پیام‌رسان را انتخاب می‌کنید."
      : "هنرجو یا کل کلاس را انتخاب کنید تا فایل اکسل دریافت شود.",
  );
  return true;
}

function canShareKarnamehExcel(file) {
  try {
    return !!(
      globalThis.isSecureContext &&
      file &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

function assertPreparedKarnamehExcel(session, prepared) {
  assertKarnamehExcelDialog(session);
  if (
    !prepared ||
    session.prepared !== prepared ||
    prepared.invalid ||
    !prepared.blob
  )
    throw Error("فایل آماده نیست؛ کلاس یا هنرجو را دوباره انتخاب کنید.");
  assertWorkspaceContext(prepared.context);
  if (
    busy ||
    drafts.size ||
    assessmentContext.hasDrafts() ||
    draftWritesPending ||
    draftRecoveryFailed
  )
    throw Error(
      "ویرایش یا ذخیرهٔ ناتمام وجود دارد؛ پس از ثبت، اکسل را دوباره آماده کنید.",
    );
}

function showPreparedKarnamehExcel(session, prepared) {
  let file = null;
  try {
    if (typeof File === "function")
      file = new File([prepared.blob], prepared.name, {
        type: prepared.blob.type,
      });
  } catch {
    /* The original XLSX blob remains available for manual attachment. */
  }
  prepared.file = file;
  prepared.invalid = false;
  session.prepared = prepared;
  const supported = canShareKarnamehExcel(file);
  const ready = session.panel.querySelector("[data-karnameh-excel-ready]");
  session.panel.querySelector("[data-karnameh-excel-file]").textContent =
    prepared.name;
  session.panel.querySelector("[data-karnameh-excel-file-size]").textContent =
    "XLSX · " +
    karnamehSheetNumber(Math.max(1, Math.ceil(prepared.blob.size / 1024))) +
    " کیلوبایت";
  const share = session.panel.querySelector(
    '[data-workspace-action="karnameh-excel-send"]',
  );
  share.hidden = !supported;
  ready.hidden = false;
  karnamehExcelMessage(
    session,
    supported
      ? "فایل آماده است؛ «انتخاب پیام‌رسان و ارسال» را بزنید و شاد یا برنامهٔ دلخواه را انتخاب کنید. برنامه‌های نمایش‌داده‌شده به دستگاه شما بستگی دارند."
      : "ارسال مستقیم فایل در این مرورگر در دسترس نیست. اکسل را دریافت کنید و در شاد یا پیام‌رسان، پیوست ← فایل را بزنید.",
  );
  ready.scrollIntoView?.({ block: "nearest" });
}

async function shareKarnamehExcel(button) {
  const session = karnamehExcelDialog;
  if (!session || session.working) return false;
  const prepared = session.prepared;
  let unlock = () => {};
  try {
    assertPreparedKarnamehExcel(session, prepared);
    if (
      !button.isConnected ||
      button.disabled ||
      button.closest("#karnamehExcelPanel") !== session.panel
    )
      return false;
    if (!canShareKarnamehExcel(prepared.file)) {
      button.hidden = true;
      karnamehExcelMessage(
        session,
        "ارسال مستقیم این فایل پشتیبانی نمی‌شود؛ اکسل را دریافت و در پیام‌رسان پیوست کنید.",
      );
      return false;
    }
    unlock = lockKarnamehExcel(session);
    // Native sharing must run in this trusted click, before any asynchronous read.
    await navigator.share({
      files: [prepared.file],
      title: "اکسل نمرات کلاس‌یار",
    });
    if (session.prepared === prepared && !prepared.invalid)
      karnamehExcelMessage(
        session,
        "فایل به پنجرهٔ اشتراک‌گذاری سپرده شد؛ ارسال نهایی را در پیام‌رسان بررسی کنید.",
        "saved",
      );
    return true;
  } catch (error) {
    if (session.prepared !== prepared || prepared?.invalid) return false;
    if (!session.working) {
      clearPreparedKarnamehExcel(session, error.message || String(error));
    } else {
      karnamehExcelMessage(
        session,
        error.name === "AbortError"
          ? "ارسال لغو شد؛ فایل آماده است و می‌توانید دوباره تلاش کنید."
          : "ارسال مستقیم انجام نشد؛ اکسل را دریافت و به‌صورت فایل در پیام‌رسان پیوست کنید.",
        error.name === "AbortError" ? "ready" : "error",
      );
    }
    return false;
  } finally {
    unlock();
  }
}

async function downloadPreparedKarnamehExcel(button) {
  const session = karnamehExcelDialog;
  if (!session || session.working) return false;
  const prepared = session.prepared;
  let unlock = () => {};
  try {
    assertPreparedKarnamehExcel(session, prepared);
    if (
      !button.isConnected ||
      button.disabled ||
      button.closest("#karnamehExcelPanel") !== session.panel
    )
      return false;
    unlock = lockKarnamehExcel(session);
    await assertReportSnapshot(prepared.context);
    assertPreparedKarnamehExcel(session, prepared);
    downloadLocalFile(prepared.blob, prepared.name);
    karnamehExcelMessage(
      session,
      "اکسل برای دریافت به مرورگر تحویل داده شد؛ در پیام‌رسان، پیوست ← فایل را انتخاب کنید.",
      "saved",
    );
    return true;
  } catch (error) {
    if (session.prepared === prepared && !prepared?.invalid)
      clearPreparedKarnamehExcel(session, error.message || String(error));
    return false;
  } finally {
    unlock();
  }
}
