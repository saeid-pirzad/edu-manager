function newCourseSeed() {
  return {
    id: api.uid(),
    name: "",
    teacher: "",
    periodsPerWeek: 2,
    gradeMode: "kardanesh",
    kardaneshScores: {},
    poudmans: [],
  };
}
function renderCreate() {
  return courseFormHtml(newCourseSeed(), null, false);
}
function activateCreate() {
  const form = document.querySelector("#app #courseEditor");
  if (!form || form.dataset.courseBound) return;
  const c = currentClass();
  if (!c) return;
  editing = {
    pageState: { ...api.state() },
    context: api.context(),
    classId: c.id,
    id: null,
    seed: newCourseSeed(),
    locked: false,
  };
  initializeCourseForm(editing.seed);
}
function cancelEditor() {
  const form = document.getElementById("courseEditor");
  if (!form) return false;
  if (saving || form?.getAttribute("aria-busy") === "true") return false;
  if (
    form?.dataset.savedState !== recordEditorState(form) &&
    !confirm("تغییرات درس ذخیره نشده‌اند؛ کنار گذاشته شوند؟")
  )
    return false;
  editing = null;
  api.render();
  document.querySelector(".lesson-create > summary")?.focus();
  return true;
}
function preserveEditor() {
  const form = document.querySelector("#app #courseEditor");
  if (!form || !editing) return null;
  if (editing.context.id !== api.context().id) {
    editing = null;
    return null;
  }
  const state = api.state();
  const samePage =
    state.view === "class" &&
    state.tab === "lessons" &&
    state.classId === editing.classId;
  if (!samePage) {
    const dirty = form.dataset.savedState !== recordEditorState(form);
    if (
      saving ||
      (dirty && !confirm("تغییرات درس ذخیره نشده‌اند؛ از فرم خارج شوید؟"))
    )
      Object.assign(state, editing.pageState);
    else {
      editing = null;
      return null;
    }
  }
  return form.closest(".lesson-create");
}
function restoreEditor(panel) {
  if (panel) document.querySelector("#app .lesson-create")?.replaceWith(panel);
}
