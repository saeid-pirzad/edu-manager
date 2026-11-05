let last = null,
  busy = false;
function weeklyNoteRange(f) {
  const dates = range("weekly", f.date, undefined, f),
    canonical = range("weekly", dates.start);
  return (
    "week:" +
    dates.start +
    (dates.start === canonical.start && dates.end === canonical.end
      ? ""
      : ":to:" + dates.end)
  );
}
const noteKey = (f) =>
  [
    noteWorkspaceId(),
    f.mode,
    notePeriodScope(
      f.mode === "weekly"
        ? weeklyNoteRange(f)
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
