let deletionContext = null,
  deletionBusy = false;
function deletionTarget(kind, id, schoolId, classId) {
  const school = getSchool(schoolId),
    cls = school?.classes.find((x) => x.id === classId);
  const item =
    kind === "school"
      ? school
      : kind === "class"
        ? cls
        : cls?.lessons.find((x) => x.id === id);
  if (!item || item.id !== id) throw Error("مورد انتخاب‌شده دیگر وجود ندارد.");
  const classes = kind === "school" ? school.classes : [cls];
  const classIds = new Set(classes.map((x) => x.id));
  const lessons =
    kind === "lesson" ? [item] : classes.flatMap((x) => x.lessons);
  const lessonIds = new Set(lessons.map((x) => x.id));
  const matches = (x) =>
    kind === "school"
      ? x.schoolId === school.id ||
        classIds.has(x.classId) ||
        lessonIds.has(x.lessonId)
      : kind === "class"
        ? x.classId === cls.id || lessonIds.has(x.lessonId)
        : x.lessonId === id;
  return { school, cls, item, matches, classes, lessons };
}
async function readDeletionCatalog(sourceConnection, expectedInstallation) {
  const tx = sourceConnection.transaction(["catalog", "records"], "readonly"),
    done = transactionDone(tx);
  const [catalog, marker] = await Promise.all([
    requestPromise(tx.objectStore("catalog").getAll()),
    requestPromise(tx.objectStore("records").get(RESET_RECORD_KEY)),
    done,
  ]);
  if ((marker?.value?.token || "") !== expectedInstallation) {
    const error = Error(
      "اطلاعات سیستم در پنجرهٔ دیگری جایگزین شده است؛ حذف انجام نشد.",
    );
    error.code = "INSTALLATION_CHANGED";
    throw error;
  }
  return catalog;
}
function openDeletion(kind, id) {
  try {
    assertEntityWritable();
    const schoolId = kind === "school" ? id : state.schoolId;
    const classId = kind === "class" ? id : state.classId;
    const target = deletionTarget(kind, id, schoolId, classId);
    const context = {
      kind,
      id,
      schoolId,
      classId,
      workspace: workspace.id,
      revision: workspace.revision,
    };
    const students =
      kind === "lesson"
        ? 0
        : target.classes.reduce(
            (n, c) =>
              n + (c.students || []).length + (c.archivedStudents || []).length,
            0,
          );
    const sessions = db.sessions.filter(target.matches).length;
    const slots = Object.values(db.masterSchedule || {}).filter(
      target.matches,
    ).length;
    const label =
      kind === "school" ? "مدرسه" : kind === "class" ? "کلاس" : "درس";
    const count = (value, title) =>
      `<li><strong>${value.toLocaleString("fa-IR")}</strong><span>${title}</span></li>`;
    const html =
      '<form class="record-editor deletion-editor" data-workspace-submit="confirm-deletion" novalidate>' +
      '<div class="deletion-target"><span class="deletion-symbol" aria-hidden="true">' +
      EduIcons.html("trash") +
      "</span><strong><bdi>" +
      esc(target.item.name) +
      '</bdi></strong></div><p id="deleteEntityWarning" class="deletion-warning">' +
      (kind === "lesson"
        ? "این درس از تمام نوبت‌های همین سال حذف می‌شود. اگر در هر نوبت نمره یا جلسه داشته باشد، برای حفظ سوابق حذف انجام نمی‌شود. هنرجویان کلاس حفظ می‌شوند."
        : "این " +
          label +
          " از فهرست مشترک این سال و تمام نوبت‌های آن حذف می‌شود. اگر در نوبت دیگری نمره یا جلسه داشته باشد، حذف انجام نمی‌شود.") +
      '</p><ul class="deletion-impact" aria-label="سوابق مرتبط">' +
      (kind === "school" ? count(target.classes.length, "کلاس") : "") +
      (kind !== "lesson"
        ? count(students, "هنرجوی فعال و بایگانی") +
          count(target.lessons.length, "درس")
        : "") +
      count(sessions, "جلسه") +
      count(slots, "زنگ برنامه هفتگی") +
      '</ul><p class="deletion-backup-note">' +
      "بازگردانی اطلاعات حذف‌شده فقط با فایل پشتیبان کاملِ پیش از حذف ممکن است." +
      "</p>" +
      '<label class="deletion-confirm" for="deleteEntityName">برای تأیید، نام ' +
      label +
      ' را بنویسید<input id="deleteEntityName" autocomplete="off" spellcheck="false" maxlength="500" aria-describedby="deleteEntityWarning deleteEntityError"></label>' +
      '<p id="deleteEntityError" role="alert"></p><div class="record-editor-actions"><button type="button" class="ghost" data-workspace-action="close">انصراف</button><button type="submit" class="danger" data-mutating="1">حذف ' +
      label +
      "</button></div></form>";
    if (showModal("حذف " + label, html) !== false) {
      deletionContext = context;
      setTimeout(
        () =>
          document
            .querySelector('.deletion-editor [data-workspace-action="close"]')
            ?.focus({ preventScroll: true }),
        0,
      );
    }
  } catch (error) {
    handleError(error);
  }
}
async function confirmDeletion() {
  if (deletionBusy) return;
  const form = document.querySelector(
    "#modal:not(.hidden) #deleteEntityName",
  )?.form;
  if (!form) return;
  deletionBusy = true;
  const finish = beginRecordEditorSave(form);
  try {
    const context = deletionContext;
    const sourceConnection = connection,
      sourceInstallation = installationToken;
    const check = () => {
      assertEntityWritable();
      if (
        !context ||
        deletionContext !== context ||
        connection !== sourceConnection ||
        installationToken !== sourceInstallation ||
        context.workspace !== workspace.id ||
        context.revision !== workspace.revision
      )
        throw Error(
          "اطلاعات یا ترم تغییر کرده است؛ پنجره حذف را دوباره باز کنید.",
        );
      return deletionTarget(
        context.kind,
        context.id,
        context.schoolId,
        context.classId,
      );
    };
    let target = check();
    if (
      document.getElementById("deleteEntityName").value.trim() !==
      target.item.name.trim()
    )
      throw recordFieldError(
        "نام واردشده با نام مورد انتخاب‌شده یکسان نیست.",
        "deleteEntityName",
      );
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    target = check();
    const catalog = await readDeletionCatalog(
      sourceConnection,
      sourceInstallation,
    );
    check();
    const directoryRevisions = catalog
      .filter((period) => period.year === workspace.year)
      .map(({ id, year, revision }) => ({ id, year, revision }));
    target = check();
    const name = target.item.name;
    if (context.kind === "school")
      db.schools = db.schools.filter((x) => x.id !== context.id);
    else if (context.kind === "class")
      target.school.classes = target.school.classes.filter(
        (x) => x.id !== context.id,
      );
    else
      target.cls.lessons = target.cls.lessons.filter(
        (x) => x.id !== context.id,
      );
    db.sessions = db.sessions.filter((x) => !target.matches(x));
    Object.keys(db.masterSchedule || {}).forEach((key) => {
      if (target.matches(db.masterSchedule[key])) delete db.masterSchedule[key];
    });
    await saveDBV24({
      action: "حذف " + name + " و سوابق مرتبط",
      directoryRevisions,
    });
    if (
      deletionContext !== context ||
      workspace.id !== context.workspace ||
      connection !== sourceConnection ||
      installationToken !== sourceInstallation ||
      periodLoading ||
      resetBusy ||
      connectionRetired
    )
      return;
    finish();
    rememberRecordEditor();
    deletionContext = null;
    if (context.kind === "school" && state.schoolId === context.id) {
      state.view = "schools";
      state.schoolId = null;
      state.classId = null;
    }
    if (context.kind === "class" && state.classId === context.id) {
      state.view = "school";
      state.classId = null;
    }
    if (context.kind === "lesson" && state.lessonId === context.id) {
      state.view = "class";
      state.lessonId = null;
    }
    render();
    closeModal();
    setStatus("حذف انجام شد.", "saved");
  } catch (error) {
    if (!showRecordEditorError(error, "deleteEntityError")) handleError(error);
  } finally {
    deletionBusy = false;
    finish();
  }
}
