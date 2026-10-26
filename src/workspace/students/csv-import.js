function csvPlan(text, c) {
  const rows = parseCSV(text);
  if (rows.length < 2)
    throw Error("فایل باید سرستون و دست‌کم یک ردیف داشته باشد.");
  const headers = rows[0].map(normalizedName),
    nameIndex = headers.findIndex((x) => x.includes("نام")),
    codeIndex = headers.findIndex(
      (x) =>
        x === "کد" ||
        (x.includes("کد") && (x.includes("دانش") || x.includes("هنرجو"))),
    );
  if (nameIndex < 0) throw Error("ستون نام یافت نشد.");
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
    const exact = code ? knownStudents(c).find((st) => st.code === code) : null,
      sameName =
        knownStudents(c).some((st) => normalizedName(st.name) === name) ||
        names.has(name);
    plan.push({
      row: i + 1,
      name,
      code,
      existingId: exact?.id || null,
      archived: exact ? !c.students.some((st) => st.id === exact.id) : false,
      duplicate: !exact && sameName,
      choice: exact ? "skip" : sameName ? "skip" : "add",
    });
    names.add(name);
  }
  return plan;
}

async function csvImportV24(e) {
  const file = e.target.files[0];
  if (!file) return;
  const origin = {
    workspace: workspace?.id,
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
      '<form id="studentCSVEditor" class="record-editor" data-workspace-submit="commit-csv" data-mutating="1"><div class="record-editor-context"><h4>' +
        esc(c.name) +
        "</h4></div>" +
        "<p>افراد هم‌نام خودکار ادغام نمی‌شوند. برای دو فرد هم‌نام، افزودن فرد مستقل را آگاهانه انتخاب کنید. کد دانش‌آموزی اختیاری ولی یکتا در کلاس است.</p><table><thead><tr><th>ردیف</th><th>نام</th><th>کد</th><th>وضعیت</th><th>تصمیم</th></tr></thead><tbody>" +
        plan
          .map(
            (r, i) =>
              "<tr><td>" +
              r.row +
              "</td><td>" +
              esc(r.name) +
              "</td><td>" +
              esc(r.code) +
              "</td><td>" +
              (r.existingId
                ? "کد موجود" + (r.archived ? " در بایگانی" : "")
                : r.duplicate
                  ? "هم‌نام؛ نیازمند بررسی"
                  : "جدید") +
              '</td><td><select id="csvDecision' +
              i +
              '" data-csv-row="' +
              i +
              '"><option value="skip" ' +
              (r.choice === "skip" ? "selected" : "") +
              ">رد کردن</option>" +
              (!r.existingId
                ? '<option value="add" ' +
                  (r.choice === "add" ? "selected" : "") +
                  ">" +
                  (r.duplicate ? "افزودن فرد مستقل هم‌نام" : "افزودن") +
                  "</option>"
                : !r.archived
                  ? '<option value="update">اصلاح نام فرد با این کد</option>'
                  : "") +
              "</select></td></tr>",
          )
          .join("") +
        '</tbody></table><div class="record-editor-actions"><button type="submit">اعمال تصمیم‌ها</button><button type="button" class="ghost" data-workspace-action="close">انصراف</button></div><p id="operationError" role="alert"></p></form>',
    );
    if (opened !== false) {
      pendingCSV = { ...origin, plan };
      rememberRecordEditor();
    }
  } catch (error) {
    handleError(error);
  } finally {
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
  const choices = [...form.querySelectorAll("[data-csv-row]")].map(
    (el) => el.value,
  );
  const finish = beginRecordEditorSave(form);
  try {
    const check = () => {
      assertEntityWritable();
      if (
        !context ||
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
        const student = c.students.find(
          (st) => st.id === row.existingId && st.code === identity.code,
        );
        if (!student)
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
    c.students.push(...additions);
    await saveDBV24({
      action:
        "ورود CSV: " +
        additions.length +
        " افزوده، " +
        updates.length +
        " اصلاح",
    });
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
