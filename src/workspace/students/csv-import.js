function csvPlan(text, c) {
  const rows = parseCSV(text);
  if (rows.length < 2)
    throw Error("فایل باید سرستون و دست‌کم یک ردیف داشته باشد.");
  const headers = rows[0].map(normalizedName),
    nameColumns = headers.flatMap((x, index) =>
      x.includes("نام") ? [index] : [],
    ),
    codeColumns = headers.flatMap((x, index) =>
      x === "کد" ||
      (x.includes("کد") && (x.includes("دانش") || x.includes("هنرجو")))
        ? [index]
        : [],
    );
  if (!nameColumns.length) throw Error("ستون نام یافت نشد.");
  if (nameColumns.length > 1 || codeColumns.length > 1)
    throw Error(
      "ستون نام یا کد مبهم است؛ برای هرکدام فقط یک ستون در فایل نگه دارید.",
    );
  const nameIndex = nameColumns[0],
    codeIndex = codeColumns[0] ?? -1,
    known = knownStudents(c),
    existingCodes = new Map(),
    existingNames = new Set(known.map((st) => normalizedName(st.name))),
    activeIds = new Set(c.students.map((st) => st.id));
  for (const student of known)
    if (student.code && !existingCodes.has(student.code))
      existingCodes.set(student.code, student);
  const codes = new Set(),
    names = new Set(),
    plan = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length !== headers.length)
      throw Error("تعداد ستون ردیف " + (i + 1) + " معتبر نیست.");
    const name = normalizedName(row[nameIndex]),
      code = codeIndex < 0 ? "" : asciiDigits(row[codeIndex]);
    if (row.every((cell) => !String(cell).trim())) continue;
    if (name.startsWith("مثال:")) continue;
    try {
      studentIdentity(name, code);
    } catch (error) {
      throw Error("ردیف " + (i + 1) + ": " + error.message, { cause: error });
    }
    if (code && codes.has(code))
      throw Error("کد " + code + " در فایل تکراری است.");
    if (code) codes.add(code);
    const exact = code ? existingCodes.get(code) : null,
      sameName = existingNames.has(name) || names.has(name);
    plan.push({
      row: i + 1,
      name,
      code,
      existingId: exact?.id || null,
      archived: exact ? !activeIds.has(exact.id) : false,
      duplicate: !exact && sameName,
      choice: exact ? "skip" : sameName ? "skip" : "add",
    });
    names.add(name);
  }
  return plan;
}

function csvPreviewHtml(plan, c, filename) {
  const fresh = plan.filter((row) => row.choice === "add").length;
  return (
    '<form id="studentCSVEditor" class="record-editor csv-preview-editor" data-review-mode="none" data-workspace-submit="commit-csv" data-mutating="1">' +
    '<div class="csv-preview-context"><strong><bdi>' +
    esc(c.name) +
    "</bdi></strong><span><bdi>" +
    esc(filename || "فایل CSV") +
    "</bdi></span></div>" +
    '<div class="csv-preview-summary"><span><strong>' +
    plan.length.toLocaleString("fa-IR") +
    "</strong> ردیف</span><span><strong>" +
    fresh.toLocaleString("fa-IR") +
    "</strong> آمادهٔ افزودن</span><span><strong>" +
    (plan.length - fresh).toLocaleString("fa-IR") +
    "</strong> نیازمند بررسی</span></div>" +
    '<p class="csv-preview-help">کدهای موجود و افراد هم‌نام خودکار اضافه یا ادغام نمی‌شوند؛ تصمیم هر ردیف را بررسی کنید.</p>' +
    '<ol class="csv-preview-list">' +
    plan
      .map(
        (row, index) =>
          '<li class="csv-preview-row"><div class="csv-row-identity"><span class="csv-row-number">' +
          row.row.toLocaleString("fa-IR") +
          "</span><div><strong><bdi>" +
          esc(row.name) +
          "</bdi></strong><small>کد: <bdi>" +
          esc(row.code || "ثبت نشده") +
          "</bdi></small></div></div>" +
          '<span class="csv-row-status ' +
          (row.choice === "add" ? "is-new" : "needs-review") +
          '">' +
          (row.existingId
            ? row.archived
              ? "کد موجود در بایگانی"
              : "کد موجود در کلاس"
            : row.duplicate
              ? "هم‌نام؛ بررسی شود"
              : "هنرجوی جدید") +
          "</span>" +
          '<label class="csv-row-decision" for="csvDecision' +
          index +
          '"><span>تصمیم برای این ردیف</span><select id="csvDecision' +
          index +
          '" data-csv-row="' +
          index +
          '"><option value="skip" ' +
          (row.choice === "skip" ? "selected" : "") +
          ">ثبت نشود</option>" +
          (!row.existingId
            ? '<option value="add" ' +
              (row.choice === "add" ? "selected" : "") +
              ">" +
              (row.duplicate ? "افزودن به‌عنوان فرد مستقل" : "افزودن هنرجو") +
              "</option>"
            : !row.archived
              ? '<option value="update">اصلاح نام صاحب این کد</option>'
              : "") +
          "</select></label></li>",
      )
      .join("") +
    '</ol><p id="operationError" role="alert"></p><div class="record-editor-actions"><button type="submit">ثبت موارد انتخاب‌شده</button><button type="button" class="ghost" data-workspace-action="close">انصراف</button></div></form>'
  );
}
let csvReading = false;
async function csvImportV24(e) {
  if (csvReading) return;
  const file = e.target.files[0];
  if (!file) return;
  csvReading = true;
  const panel = document.querySelector(".student-import");
  const button = panel?.querySelector(
    '[data-legacy-click="ui-school-class:18"]',
  );
  const status = panel?.querySelector(".csv-import-status");
  const errorBox = panel?.querySelector(".csv-import-error");
  if (button) setControlLock(button, "csv-reading", true);
  if (panel) panel.setAttribute("aria-busy", "true");
  if (status) status.textContent = "در حال بررسی فایل…";
  if (errorBox) errorBox.textContent = "";
  const origin = {
    workspace: workspace?.id,
    connection,
    schoolId: state.schoolId,
    classId: state.classId,
    revision: workspace?.revision,
  };
  try {
    assertEntityWritable();
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    assertEntityWritable();
    if (
      origin.workspace !== workspace.id ||
      origin.connection !== connection ||
      origin.schoolId !== state.schoolId ||
      origin.classId !== state.classId
    )
      throw Error("کلاس یا دوره تغییر کرده است؛ فایل را دوباره انتخاب کنید.");
    origin.revision = workspace.revision;
    if (file.size > 5 * 1024 * 1024)
      throw Error("حداکثر حجم CSV پنج مگابایت است.");
    const c = getClassObj(state.schoolId, state.classId);
    if (!c) throw Error("کلاس انتخاب نشده است.");
    const text = await file.text();
    await writer.catch(() => {});
    assertEntityWritable();
    if (
      origin.workspace !== workspace.id ||
      origin.connection !== connection ||
      origin.schoolId !== state.schoolId ||
      origin.classId !== state.classId ||
      origin.revision !== workspace.revision
    )
      throw Error(
        "کلاس، دوره یا اطلاعات تغییر کرده است؛ فایل را دوباره انتخاب کنید.",
      );
    const plan = csvPlan(text, getClassObj(origin.schoolId, origin.classId));
    if (!plan.length) throw Error("فایل ردیف قابل ثبت ندارد.");
    const opened = showModal(
      "پیش‌نمایش ورود دانش‌آموزان",
      csvPreviewHtml(plan, c, file.name),
    );
    if (opened !== false) {
      pendingCSV = { ...origin, plan };
      rememberRecordEditor();
    }
  } catch (error) {
    if (
      errorBox?.isConnected &&
      origin.workspace === workspace?.id &&
      origin.classId === state.classId
    ) {
      panel.open = true;
      errorBox.textContent = error.message || String(error);
    } else handleError(error);
  } finally {
    csvReading = false;
    if (button) setControlLock(button, "csv-reading", false);
    if (panel) panel.removeAttribute("aria-busy");
    if (status) status.textContent = "";
    e.target.value = "";
  }
}

let csvSaving = false;
async function commitCSV() {
  if (csvSaving) return false;
  const form = document.querySelector("#modal:not(.hidden) #studentCSVEditor");
  if (!form) return false;
  csvSaving = true;
  const context = pendingCSV;
  const sourceConnection = connection;
  const choices = [...form.querySelectorAll("[data-csv-row]")].map(
    (el) => el.value,
  );
  const finish = beginRecordEditorSave(form);
  try {
    const check = () => {
      assertEntityWritable();
      if (
        !context ||
        pendingCSV !== context ||
        connection !== sourceConnection ||
        (context.connection && context.connection !== connection) ||
        context.workspace !== workspace.id ||
        context.revision !== workspace.revision ||
        context.schoolId !== state.schoolId ||
        context.classId !== state.classId
      )
        throw Error(
          "کلاس، دوره یا اطلاعات تغییر کرده است؛ پیش‌نمایش را دوباره بسازید.",
        );
      const c = getClassObj(context.schoolId, context.classId);
      if (!c) throw Error("کلاس دیگر وجود ندارد.");
      return c;
    };
    check();
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    const c = check(),
      additions = [],
      updates = [];
    const codes = new Set(
      knownStudents(c)
        .map((st) => st.code)
        .filter(Boolean),
    );
    const activeById = new Map(
      c.students.map((student) => [student.id, student]),
    );
    context.plan.forEach((row, i) => {
      const choice = choices[i];
      if (choice === "skip") return;
      const identity = studentIdentity(row.name, row.code);
      if (choice === "add" && !row.existingId) {
        if (identity.code && codes.has(identity.code))
          throw Error("کد هنرجو در کلاس تکراری است: " + identity.code);
        if (identity.code) codes.add(identity.code);
        additions.push({ id: uid(), ...identity });
      } else if (choice === "update" && row.existingId && !row.archived) {
        const student = activeById.get(row.existingId);
        if (!student || student.code !== identity.code)
          throw Error(
            "هویت هنرجوی مقصد تغییر کرده است؛ فایل را دوباره بررسی کنید.",
          );
        if (student.name !== identity.name || student.recovered)
          updates.push({ student, identity });
      } else throw Error("تصمیم ردیف " + row.row + " معتبر نیست.");
    });
    if (!additions.length && !updates.length)
      throw Error("تغییری برای ثبت انتخاب نشده است.");
    freezeClassRosters(c);
    for (const { student, identity } of updates)
      applyStudentIdentity(c, student, identity);
    for (const student of additions) c.students.push(student);
    await saveDBV24({
      action:
        "ورود CSV: " +
        additions.length +
        " افزوده، " +
        updates.length +
        " اصلاح",
    });
    if (
      pendingCSV !== context ||
      connection !== sourceConnection ||
      workspace.id !== context.workspace ||
      state.schoolId !== context.schoolId ||
      state.classId !== context.classId ||
      periodLoading ||
      resetBusy ||
      connectionRetired
    )
      return true;
    finish();
    rememberRecordEditor();
    pendingCSV = null;
    closeModal();
    render();
    setStatus(
      "CSV اعمال شد: " +
        additions.length +
        " افزوده و " +
        updates.length +
        " اصلاح.",
      "saved",
    );
    return true;
  } catch (error) {
    if (!showRecordEditorError(error, "operationError")) handleError(error);
    return false;
  } finally {
    csvSaving = false;
    finish();
  }
}

function downloadCSVTemplate() {
  const text =
    "\uFEFFکد دانش‌آموز,نام و نام خانوادگی\n1001,مثال: علی رضایی\n1002,مثال: علی رضایی\n";
  downloadLocalFile(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
    "قالب-دانش‌آموزان.csv",
  );
}
