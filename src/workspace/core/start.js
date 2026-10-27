const courseUI = EduCourseUI({
  esc,
  uid,
  asciiDigits,
  findClass,
  getDB: () => db,
  context: () => ({
    id: workspace?.id,
    revision: workspace?.revision,
    closed: !!workspace?.closed,
    readOnly: fileMode || !!workspace?.closed || blocked || !ready,
  }),
  state: () => state,
  year: () => db.settings.academicYear,
  assertWritable: () => {
    if (fileMode || workspace?.closed || blocked || !ready)
      throw Error("دوره فعلی قابل ویرایش نیست.");
  },
  flushDrafts,
  saveDB: saveDBV24,
  showModal: showModalV24,
  closeModal: () => closeModal(),
  render: () => render(),
  showCourseClass: () => {
    state.view = "class";
    state.lessonId = null;
    state.tab = "lessons";
    render();
  },
  error: handleError,
  students: getSortedStudents,
  knownStudents,
  calc: calcV24,
  gradeCell,
  finalText,
  status: policyStatus,
});

installRuntimeAPI();
if (!globalThis.__EDU_TEST_MODE__ && !globalThis.__EDU_UNIT_TEST__)
  delete window.EduV24.test;
if (!globalThis.__EDU_UNIT_TEST__) {
  installUI();
  bootstrapV24();
}
