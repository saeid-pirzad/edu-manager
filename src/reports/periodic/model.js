let last = null,
  busy = false;
const noteKey = (f) =>
  [
    noteWorkspaceId(),
    f.mode,
    notePeriodScope(
      f.mode === "weekly"
        ? "week:" + range("weekly", f.date).start
        : f.mode === "monthly"
          ? "month:" + range("monthly", f.date).start
          : f.mode === "annual"
            ? "academic-year:" +
              (f.annualFirstId || "auto") +
              ":" +
              (f.annualSecondId || "auto")
            : f.date,
    ),
    f.schoolId,
    f.classId,
    f.audience,
    f.audience === "parent" ? f.studentId : "",
  ].join("|");
const inputSnapshot = () => ({
  ...filters,
  workspaceId: context().id,
  note: readNote(noteKey(filters)),
});
const reportSignature = () =>
  JSON.stringify({ input: inputSnapshot(), context: context() });
function build(source, options) {
  return root.EduReportModel.build(source, options, {
    generatedAt: new Date().toISOString(),
    collisionScope: "teacher",
  });
}
