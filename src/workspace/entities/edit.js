let entityEditing = null,
  entitySaving = false;
function assertEntityWritable() {
  if (
    fileMode ||
    !ready ||
    periodLoading ||
    resetBusy ||
    connectionRetired ||
    blocked ||
    workspace?.closed
  )
    throw Error("ترم فعلی قابل ویرایش نیست.");
  if (db.settings.password && !isAuthenticated)
    throw Error("ابتدا وارد ترم شوید.");
}
async function openEntityEditor(kind, id, schoolId = "") {
  const requestedContext = {
    workspace: workspace?.id,
    bank: db,
    connection,
    installation:
      typeof installationToken === "undefined" ? "" : installationToken,
  };
  assertEntityWritable();
  await flushDrafts({ strict: true });
  assertEntityWritable();
  if (
    requestedContext.workspace !== workspace.id ||
    requestedContext.bank !== db ||
    requestedContext.connection !== connection ||
    requestedContext.installation !==
      (typeof installationToken === "undefined" ? "" : installationToken)
  )
    throw Error("ترم هنگام باز شدن فرم تغییر کرد؛ دوباره ویرایش را باز کنید.");
  if (!["school", "class"].includes(kind))
    throw Error("نوع اطلاعات نامعتبر است.");
  const school = kind === "school" ? getSchool(id) : getSchool(schoolId);
  const item =
    kind === "school" ? school : school?.classes.find((c) => c.id === id);
  if (!item) throw Error("اطلاعات پیدا نشد؛ صفحه را تازه کنید.");
  const previousEditing = entityEditing;
  entityEditing = {
    ...requestedContext,
    kind,
    id,
    schoolId: school.id,
    revision: workspace.revision,
  };
  const label = kind === "school" ? "مدرسه" : "کلاس";
  const classes = kind === "school" ? item.classes : [item];
  const count = classes.reduce((n, c) => n + c.students.length, 0);
  const opened = showModal(
    "مشاهدهٔ مشخصات " + label,
    '<form class="record-editor" data-record-kind="' +
      kind +
      '" data-workspace-submit="save-entity"><div class="record-editor-context"><span>' +
      esc(workspace.year + " · " + workspace.term) +
      "</span><h4>" +
      esc(item.name) +
      "</h4><p>" +
      esc(
        kind === "class"
          ? school.name
          : classes.length.toLocaleString("fa-IR") + " کلاس",
      ) +
      " · " +
      count.toLocaleString("fa-IR") +
      ' هنرجو</p></div><label class="course-field">نام ' +
      label +
      '<input id="entityEditName" name="name" value="' +
      esc(item.name) +
      '" required maxlength="500" autocomplete="off" aria-describedby="entityEditHint entityEditError"></label>' +
      '<p id="entityEditHint" class="muted">تغییر نام در همهٔ نوبت‌های این سال تحصیلی اعمال می‌شود؛ نمرات و جلسات هر نوبت حفظ می‌شوند. کارنامه‌های نهایی قبلی تغییر نمی‌کنند.</p><p id="entityEditError" role="alert"></p>' +
      '<div class="record-editor-actions"><button type="submit" data-mutating="1">ذخیره تغییرات</button><button type="button" class="ghost" data-workspace-action="close">انصراف</button></div></form>',
  );
  if (opened === false) {
    entityEditing = previousEditing;
    return false;
  }
  const edit = entityEditing;
  initializeRecordEditAccess(document.querySelector("#modal .record-editor"), {
    title: "ویرایش مشخصات " + label,
    validate: () => {
      assertEntityWritable();
      if (
        entityEditing !== edit ||
        edit.workspace !== workspace.id ||
        edit.bank !== db ||
        edit.connection !== connection ||
        edit.revision !== workspace.revision ||
        edit.installation !==
          (typeof installationToken === "undefined" ? "" : installationToken)
      )
        throw Error("اطلاعات تغییر کرده است؛ فرم را دوباره باز کنید.");
    },
  });
  rememberRecordEditor();
}
async function saveEntityEditor() {
  if (entitySaving) return;
  entitySaving = true;
  const finishSave = beginRecordEditorSave(
    document.querySelector("#modal .record-editor"),
  );
  const edit = entityEditing;
  let attemptedSave = false;
  try {
    assertEntityWritable();
    assertRecordEditAccess(document.querySelector("#modal .record-editor"));
    if (!document.querySelector("#modal:not(.hidden) #entityEditName"))
      throw Error("فرم ویرایش باز نیست.");
    const isCurrent = () =>
      edit &&
      entityEditing === edit &&
      edit.workspace === workspace.id &&
      edit.bank === db &&
      edit.connection === connection &&
      edit.installation ===
        (typeof installationToken === "undefined" ? "" : installationToken);
    if (!isCurrent() || edit.revision !== workspace.revision)
      throw Error(
        "اطلاعات از زمان باز شدن فرم تغییر کرده است؛ فرم را دوباره باز کنید.",
      );
    const name = document
      .getElementById("entityEditName")
      .value.trim()
      .replace(/\s+/g, " ");
    if (!normalizedName(name) || name.length > 500)
      throw recordFieldError(
        "نام معتبر با حداکثر ۵۰۰ نویسه وارد کنید.",
        "entityEditName",
      );
    await flushDrafts({ strict: true });
    assertEntityWritable();
    assertRecordEditAccess(document.querySelector("#modal .record-editor"));
    if (!isCurrent() || edit.revision !== workspace.revision)
      throw Error("ترم یا اطلاعات تغییر کرده است؛ فرم را دوباره باز کنید.");
    const school = getSchool(edit.schoolId);
    const item =
      edit.kind === "school"
        ? school
        : school?.classes.find((c) => c.id === edit.id);
    if (!item) throw Error("اطلاعات مقصد دیگر وجود ندارد.");
    const peers = edit.kind === "school" ? db.schools : school.classes;
    if (
      normalizedName(item.name) !== normalizedName(name) &&
      peers.some(
        (x) =>
          x.id !== item.id && normalizedName(x.name) === normalizedName(name),
      )
    )
      throw recordFieldError(
        edit.kind === "school"
          ? "مدرسه‌ای با همین نام وجود دارد."
          : "کلاسی با همین نام در این مدرسه وجود دارد.",
        "entityEditName",
      );
    if (item.name !== name) {
      item.name = name;
      attemptedSave = true;
      await saveDBV24({
        ...(edit.kind === "class" ? { classId: item.id } : {}),
        action: "ویرایش نام " + (edit.kind === "school" ? "مدرسه" : "کلاس"),
      });
    }
    if (!isCurrent() || periodLoading || resetBusy || connectionRetired) return;
    entityEditing = null;
    finishSave();
    rememberRecordEditor();
    closeModal();
    render();
  } catch (error) {
    // saveDBV24 reloads the durable bank after a failed own write. Permit a
    // retry of this same form only when its installation and revision survived.
    if (
      attemptedSave &&
      entityEditing === edit &&
      edit.workspace === workspace?.id &&
      edit.revision === workspace?.revision &&
      edit.connection === connection &&
      edit.installation ===
        (typeof installationToken === "undefined" ? "" : installationToken) &&
      !blocked &&
      !periodLoading &&
      !resetBusy &&
      !connectionRetired
    )
      edit.bank = db;
    if (!showRecordEditorError(error, "entityEditError")) handleError(error);
  } finally {
    entitySaving = false;
    finishSave();
  }
}
