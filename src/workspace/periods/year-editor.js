let academicYearEditing = null,
  academicYearSaving = false;
async function openAcademicYear() {
  assertWorkspaceReadable();
  await flushDrafts({ strict: true });
  await writer;
  const origin = captureWorkspaceContext(),
    database = connection,
    rows = await allFrom("catalog");
  assertWorkspaceContext(origin);
  if (connection !== database) throw Error("اتصال سال تغییر کرده است.");
  const years = [...new Set(rows.map((row) => row.year))].sort().reverse();
  const yearButtons = years
    .map((year) => {
      const candidates = rows.filter((row) => row.year === year),
        first = candidates.filter(
          (row) => (row.termKind || academicTermKind(row.term)) === "first",
        ),
        second = candidates.filter(
          (row) => (row.termKind || academicTermKind(row.term)) === "second",
        ),
        selected =
          year === workspace.year
            ? workspace
            : first.length === 1
              ? first[0]
              : second.length === 1
                ? second[0]
                : null;
      return (
        '<button type="button" class="ghost" data-workspace-action="open-academic-year" data-key="' +
        esc(selected?.id || "") +
        '"' +
        (!selected || year === workspace.year ? " disabled" : "") +
        ">" +
        esc(year) +
        (year === workspace.year ? " · سال فعال" : "") +
        "</button>"
      );
    })
    .join("");
  const openTerms = rows.filter(
    (row) =>
      row.year === workspace.year &&
      !row.closed &&
      ["first", "second"].includes(row.termKind || academicTermKind(row.term)),
  );
  const continuation =
    workspace.closed &&
    openTerms.length === 1 &&
    openTerms[0].id !== workspace.id
      ? '<section class="period-management"><h4>ادامهٔ کار در همین سال</h4><p class="period-intro">بخش فعلی برای حفظ کارنامه و نمرات بسته است. برای ثبت حضور و فعالیت‌های جدید، بخش باز همین سال را انتخاب کنید.</p><button type="button" data-workspace-action="open-academic-year" data-key="' +
        esc(openTerms[0].id) +
        '">ادامهٔ ثبت روزانه در همین سال</button></section>'
      : "";
  const nextStart = Number(workspace.year.split("-")[0]) + 1;
  const opened = showModal(
    "سال تحصیلی",
    '<div class="period-hub academic-year-hub"><div class="record-editor-context"><span>سال فعال</span><h4><bdi>' +
      esc(workspace.year) +
      "</bdi></h4><p>مدرسه‌ها، کلاس‌ها، هنرجویان، درس‌ها و برنامهٔ هفتگی در تمام سال مشترک‌اند.</p></div>" +
      '<p class="period-intro">میان‌ترم اول، پایان‌ترم اول، میان‌ترم دوم و پایان‌ترم دوم را داخل دفتر نمرهٔ همان درس انتخاب کنید؛ برای ادامهٔ کار نیازی به ساخت یا بستن ترم نیست.</p>' +
      continuation +
      '<section class="period-management"><h4>سال‌های ثبت‌شده</h4><div class="row period-actions">' +
      yearButtons +
      "</div></section>" +
      '<details class="period-list"><summary>ایجاد سال تحصیلی جدید</summary><form class="record-editor" data-workspace-submit="create-academic-year" novalidate>' +
      '<label class="course-field">سال تحصیلی<input id="newAcademicYear" name="year" inputmode="numeric" dir="ltr" required value="' +
      nextStart +
      "-" +
      (nextStart + 1) +
      '" aria-describedby="academicYearHelp academicYearError"></label>' +
      '<p id="academicYearHelp" class="muted">سال جدید با فهرست خالی شروع می‌شود؛ تمام اطلاعات سال‌های قبلی در برنامه و پشتیبان کامل باقی می‌ماند.</p><p id="academicYearError" role="alert"></p><div class="record-editor-actions"><button type="submit" data-mutating="1">ایجاد سال جدید</button></div></form></details>' +
      '<details class="period-list"><summary>کارنامه‌های ثابت و قفل نمرات نوبت</summary><p class="period-intro">بستن نوبت اختیاری است و برای ثبت کارنامهٔ ثابت و قفل‌کردن نمرات آن به‌کار می‌رود.</p><button type="button" class="ghost" data-workspace-action="term-records">مدیریت کارنامه‌های ثابت</button></details></div>',
  );
  if (opened !== false)
    academicYearEditing = {
      ...origin,
      connection: database,
      node: document.getElementById("newAcademicYear"),
    };
}
async function createAcademicYear() {
  if (academicYearSaving) return false;
  const editing = academicYearEditing,
    form = editing?.node?.form;
  if (
    !form?.isConnected ||
    document.getElementById("modal").classList.contains("hidden")
  )
    throw Error("فرم سال جدید باز نیست.");
  academicYearSaving = true;
  const finish = beginRecordEditorSave(form);
  try {
    assertWorkspaceContext(editing);
    if (connection !== editing.connection) throw Error("اتصال سال تغییر کرد.");
    const year = EduAcademicYear.normalize(editing.node.value);
    await flushDrafts({ strict: true });
    await writer;
    assertWorkspaceContext(editing);
    if (
      academicYearEditing !== editing ||
      !form.isConnected ||
      connection !== editing.connection
    )
      throw Error("فرم سال تغییر کرد؛ دوباره باز کنید.");
    const rows = await allFrom("catalog");
    assertWorkspaceContext(editing);
    if (rows.some((row) => row.year === year))
      throw Error(
        "این سال قبلاً ایجاد شده است؛ آن را از فهرست سال‌ها باز کنید.",
      );
    const data = v24DefaultDB();
    data.settings.academicYear = year;
    data.settings.academicTerm = "اول";
    const created = await installWorkspace(data, {
      year,
      term: "اول",
      newAcademicYear: true,
    });
    finish();
    rememberRecordEditor(form);
    academicYearEditing = null;
    await switchPeriod(created.id);
    setStatus(
      "سال تحصیلی ایجاد شد؛ مدرسه و کلاس‌های این سال را اضافه کنید.",
      "saved",
    );
    scheduleSingleFile();
    return true;
  } catch (error) {
    if (form.isConnected)
      form.querySelector("#academicYearError").textContent = error.message;
    else handleError(error);
    return false;
  } finally {
    academicYearSaving = false;
    finish();
  }
}
async function openStoredAcademicYear(id) {
  assertWorkspaceReadable();
  const row = await readRecord("catalog", id);
  if (!row) throw Error("سال انتخاب‌شده دیگر موجود نیست.");
  await switchPeriod(id);
  rememberAcademicYear(row.year);
}
