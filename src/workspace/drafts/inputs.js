function contextFromInput(input) {
  return {
    kind: input.dataset.kind,
    baseRevision: workspace.revision,
    classId: input.dataset.class,
    lid: input.dataset.lesson,
    sid: input.dataset.student,
    pid: input.dataset.pod,
    uid: input.dataset.unit,
    field: input.dataset.field,
    value: input.value,
    at: new Date().toISOString(),
  };
}

function gradeInput(input) {
  if (resetBusy || connectionRetired) return;
  const item = contextFromInput(input),
    key = inputKey(item),
    parsed = parseDraft(item);
  item.error = parsed.ok ? "" : parsed.message;
  drafts.set(key, item);
  input.setAttribute("aria-invalid", parsed.ok ? "false" : "true");
  const row = input.closest(".assessment-student");
  if (row) row.dataset.editState = parsed.ok ? "pending" : "error";
  const note = input.parentElement?.querySelector(".grade-note");
  if (note) {
    note.textContent = parsed.ok ? "در انتظار ذخیره" : parsed.message;
    note.dataset.state = parsed.ok ? "pending" : "error";
  }
  if (row?.querySelector('.grade-note[data-state="error"]')) row.dataset.editState = "error";
  storeDrafts();
  setStatus(
    parsed.ok ? "ویرایش در انتظار ذخیره است." : parsed.message,
    parsed.ok ? "pending" : "error",
  );
  clearTimeout(draftTimer);
  if (parsed.ok)
    draftTimer = setTimeout(() => flushDrafts().catch(() => {}), 180);
}

function clearGrade(input) {
  if (resetBusy || connectionRetired) return;
  const item = contextFromInput(input);
  if (
    !confirm(
      "نمره این بخش پاک شود؟ این تغییر در تاریخچه ثبت و قابل بازگردانی است.",
    )
  )
    return;
  item.value = "";
  item.remove = true;
  item.error = "";
  drafts.set(inputKey(item), item);
  input.value = "";
  input.setAttribute("aria-invalid", "false");
  const row = input.closest(".assessment-student");
  if (row) row.dataset.editState = "pending";
  const note = input.parentElement?.querySelector(".grade-note");
  if (note) {
    note.textContent = "در انتظار ذخیره";
    note.dataset.state = "pending";
  }
  if (row?.querySelector('.grade-note[data-state="error"]')) row.dataset.editState = "error";
  storeDrafts();
  flushDrafts().catch(() => {});
}

function findClass(id) {
  for (const school of db.schools) {
    const c = school.classes.find((c) => c.id === id);
    if (c) return c;
  }
  return null;
}
