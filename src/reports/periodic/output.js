async function output(kind) {
  const model = await generate();
  if (!model) return false;
  const prepared = last;
  try {
    if (!isPreparedCurrent(prepared))
      throw Error("گزارش دیگر معتبر نیست؛ دوباره آن را تهیه کنید.");
    if (kind === "print") {
      await root.EduV24.printReport(
        document.querySelector("[data-periodic-print]"),
        {
          context: prepared.context,
          validate: () => isPreparedCurrent(prepared),
        },
      );
      return true;
    }
    if (!["txt", "json"].includes(kind)) return false;
    await root.EduV24.assertReportSnapshot(prepared.context);
    if (!isPreparedCurrent(prepared))
      throw Error(
        "محدوده یا متن گزارش تغییر کرده است؛ دوباره گزارش را تهیه کنید.",
      );
    const content =
      kind === "json" ? JSON.stringify(model, null, 2) : textReport(model);
    const blob = new Blob([content], {
      type:
        kind === "json"
          ? "application/json;charset=utf-8"
          : "text/plain;charset=utf-8",
    });
    downloadLocalFile(
      blob,
      "edu-" +
        model.mode +
        "-" +
        model.start +
        "-" +
        model.audience +
        "." +
        kind,
    );
    return true;
  } catch (e) {
    invalidate(e.message || String(e));
    return false;
  }
}
root.EduPeriodicReports = {
  filters,
  selectScope,
  render,
  set,
  invalidate,
  workspaceChanged(message) {
    if (
      last?.context?.members?.some(
        (member) =>
          member.id === message.workspace && message.revision > member.revision,
      )
    )
      invalidate(
        "اطلاعات یکی از نوبت‌های گزارش سالانه تغییر کرد؛ گزارش را دوباره تهیه کنید.",
      );
  },
  generate,
  output,
  build,
  range,
  addDays,
  textReport,
  documentHtml,
  note(value) {
    const key = noteKey(filters);
    const saved = persistNote(
      key,
      String(value).slice(0, Math.max(10000, readNote(key).length)),
    );
    paintNoteState();
    return saved;
  },
  author(value) {
    filters.author = String(value).slice(0, 200);
  },
  retryNotes,
  getDrafts,
  restoreDrafts,
  resetDrafts,
  getLast: () =>
    last && last.signature === reportSignature() ? last.model : null,
};
root.EduV24?.recoverReportNotes?.();
