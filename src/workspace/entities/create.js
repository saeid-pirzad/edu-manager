let entityCreationBusy = false;
async function createEntityV24(event, kind) {
  event.preventDefault();
  if (entityCreationBusy) return false;
  const form = event.target,
    name = String(form.elements.namedItem("name")?.value || "")
      .trim()
      .replace(/\s+/g, " ");
  const target = {
    workspace: workspace?.id,
    schoolId: state.schoolId,
    view: state.view,
  };
  const fieldId = kind + "CreateName";
  entityCreationBusy = true;
  const finishSave = beginRecordEditorSave(form);
  try {
    assertEntityWritable();
    if (!normalizedName(name) || name.length > 500)
      throw recordFieldError(
        "نام معتبر با حداکثر ۵۰۰ نویسه وارد کنید.",
        fieldId,
      );
    await flushDrafts({ strict: true });
    assertEntityWritable();
    if (
      target.workspace !== workspace.id ||
      target.view !== state.view ||
      (kind === "class" && target.schoolId !== state.schoolId)
    )
      throw Error("دوره یا صفحه مقصد تغییر کرده است؛ ثبت انجام نشد.");
    const school = kind === "class" ? getSchool(target.schoolId) : null;
    if (kind === "class" && !school) throw Error("مدرسه مقصد وجود ندارد.");
    const peers = kind === "school" ? db.schools : school.classes;
    if (peers.some((x) => normalizedName(x.name) === normalizedName(name)))
      throw recordFieldError(
        kind === "school"
          ? "مدرسه‌ای با همین نام وجود دارد."
          : "کلاسی با همین نام در این مدرسه وجود دارد.",
        fieldId,
      );
    peers.push(
      kind === "school"
        ? { id: uid(), name, classes: [] }
        : {
            id: uid(),
            name,
            students: [],
            archivedStudents: [],
            lessons: [],
          },
    );
    await saveDBV24({
      action: "افزودن " + (kind === "school" ? "مدرسه" : "کلاس") + ": " + name,
    });
    render();
    return true;
  } catch (error) {
    const sameTarget =
      target.workspace === workspace?.id &&
      target.view === state.view &&
      (kind !== "class" || target.schoolId === state.schoolId);
    const currentForm = sameTarget
      ? document.querySelector('form[data-entity-create="' + kind + '"]')
      : null;
    if (currentForm) {
      const input = currentForm.elements.namedItem("name");
      input.value = name;
      currentForm.querySelector(".entity-create-error").textContent =
        error.message;
      const detail = currentForm.closest("details");
      if (detail) detail.open = true;
      if (error.fieldId) input.setAttribute("aria-invalid", "true");
      requestAnimationFrame(() => {
        const currentDetail = input.closest("details");
        if (currentDetail) currentDetail.open = true;
        if (input.isConnected && !input.disabled)
          input.focus({ preventScroll: true });
      });
    } else handleError(error);
    return false;
  } finally {
    entityCreationBusy = false;
    finishSave();
  }
}
