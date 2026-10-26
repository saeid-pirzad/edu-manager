// Event handlers extracted from src/legacy/reports/student.js.
EduLegacyEvents.register("reports-student:0", function (event) {
  return updateKarnamehFilter("schoolId", this.value);
});

EduLegacyEvents.register("reports-student:1", function (event) {
  return updateKarnamehFilter("classId", this.value);
});

EduLegacyEvents.register("reports-student:2", function (event) {
  return updateKarnamehFilter("studentId", this.value);
});

EduLegacyEvents.register("reports-student:3", function (event) {
  return EduV24.printReport(this);
});

EduLegacyEvents.register("reports-student:4", function (event) {
  return EduV24.printReport(this);
});

EduLegacyEvents.register("reports-student:5", function (event) {
  return toggleAllApplyForLesson(
    this.getAttribute("data-legacy-change-arg1"),
    "pos",
    this.checked,
  );
});

EduLegacyEvents.register("reports-student:6", function (event) {
  return toggleAllApplyForLesson(
    this.getAttribute("data-legacy-change-arg2"),
    "neg",
    this.checked,
  );
});

EduLegacyEvents.register("reports-student:7", function (event) {
  return toggleAllApplyForLesson(
    this.getAttribute("data-legacy-change-arg3"),
    "hw",
    this.checked,
  );
});

EduLegacyEvents.register("reports-student:8", function (event) {
  return toggleAllApplyForLesson(
    this.getAttribute("data-legacy-change-arg4"),
    "present",
    this.checked,
  );
});

EduLegacyEvents.register("reports-student:9", function (event) {
  return toggleAllApplyForLesson(
    this.getAttribute("data-legacy-change-arg5"),
    "late",
    this.checked,
  );
});

EduLegacyEvents.register("reports-student:10", function (event) {
  return toggleUnitApply(
    this.getAttribute("data-legacy-change-arg9"),
    this.getAttribute("data-legacy-change-arg10"),
    this.getAttribute("data-legacy-change-arg11"),
    "pos",
    this.checked,
  );
});

EduLegacyEvents.register("reports-student:11", function (event) {
  return toggleUnitApply(
    this.getAttribute("data-legacy-change-arg13"),
    this.getAttribute("data-legacy-change-arg14"),
    this.getAttribute("data-legacy-change-arg15"),
    "neg",
    this.checked,
  );
});

EduLegacyEvents.register("reports-student:12", function (event) {
  return toggleUnitApply(
    this.getAttribute("data-legacy-change-arg17"),
    this.getAttribute("data-legacy-change-arg18"),
    this.getAttribute("data-legacy-change-arg19"),
    "hw",
    this.checked,
  );
});

EduLegacyEvents.register("reports-student:13", function (event) {
  return toggleUnitApply(
    this.getAttribute("data-legacy-change-arg21"),
    this.getAttribute("data-legacy-change-arg22"),
    this.getAttribute("data-legacy-change-arg23"),
    "present",
    this.checked,
  );
});

EduLegacyEvents.register("reports-student:14", function (event) {
  return toggleUnitApply(
    this.getAttribute("data-legacy-change-arg25"),
    this.getAttribute("data-legacy-change-arg26"),
    this.getAttribute("data-legacy-change-arg27"),
    "late",
    this.checked,
  );
});
