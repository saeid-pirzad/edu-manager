// Event handlers extracted from src/legacy/grading/lesson-editor.js.
EduLegacyEvents.register("grading-lesson-editor:0", function (event) {
  return openBulkScoreModal(this.getAttribute("data-legacy-click-arg1"));
});

EduLegacyEvents.register("grading-lesson-editor:1", function (event) {
  return toggleAllApplyForLessonInLesson(
    this.getAttribute("data-legacy-change-arg3"),
    "pos",
    this.checked,
  );
});

EduLegacyEvents.register("grading-lesson-editor:2", function (event) {
  return toggleAllApplyForLessonInLesson(
    this.getAttribute("data-legacy-change-arg5"),
    "neg",
    this.checked,
  );
});

EduLegacyEvents.register("grading-lesson-editor:3", function (event) {
  return toggleAllApplyForLessonInLesson(
    this.getAttribute("data-legacy-change-arg7"),
    "hw",
    this.checked,
  );
});

EduLegacyEvents.register("grading-lesson-editor:4", function (event) {
  return toggleAllApplyForLessonInLesson(
    this.getAttribute("data-legacy-change-arg9"),
    "present",
    this.checked,
  );
});

EduLegacyEvents.register("grading-lesson-editor:5", function (event) {
  return toggleAllApplyForLessonInLesson(
    this.getAttribute("data-legacy-change-arg11"),
    "late",
    this.checked,
  );
});

EduLegacyEvents.register("grading-lesson-editor:6", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg2"),
    this.getAttribute("data-legacy-change-arg3"),
    this.getAttribute("data-legacy-change-arg4"),
    "pos",
    this.checked,
  );
});

EduLegacyEvents.register("grading-lesson-editor:7", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg6"),
    this.getAttribute("data-legacy-change-arg7"),
    this.getAttribute("data-legacy-change-arg8"),
    "neg",
    this.checked,
  );
});

EduLegacyEvents.register("grading-lesson-editor:8", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg10"),
    this.getAttribute("data-legacy-change-arg11"),
    this.getAttribute("data-legacy-change-arg12"),
    "hw",
    this.checked,
  );
});

EduLegacyEvents.register("grading-lesson-editor:9", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg14"),
    this.getAttribute("data-legacy-change-arg15"),
    this.getAttribute("data-legacy-change-arg16"),
    "present",
    this.checked,
  );
});

EduLegacyEvents.register("grading-lesson-editor:10", function (event) {
  return toggleUnitApplyDirect(
    this.getAttribute("data-legacy-change-arg18"),
    this.getAttribute("data-legacy-change-arg19"),
    this.getAttribute("data-legacy-change-arg20"),
    "late",
    this.checked,
  );
});
