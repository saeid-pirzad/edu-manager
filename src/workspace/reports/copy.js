// Every legacy report copy uses the same durable snapshot and revision guards
// as modern exports. Text generation stays synchronous and side-effect free.
function reportCopyScope() {
  return JSON.stringify({
    navigation: state,
    activity: globalFilter,
    lesson: lessonReportFilter,
    student: karnamehFilter,
    session: currentSessionId,
  });
}

async function copyReportV24(buildText, button, formatHTML) {
  const origin = workspace?.id,
    sourceConnection = connection,
    scope = reportCopyScope();
  const ensureCurrent = () => {
    if (!fileMode) assertWorkspaceReadable();
    else if (
      !ready ||
      blocked ||
      periodLoading ||
      resetBusy ||
      connectionRetired ||
      (db.settings.password && !isAuthenticated)
    )
      throw Error("اطلاعات برای تهیهٔ گزارش آماده نیست.");
    if (
      workspace?.id !== origin ||
      connection !== sourceConnection ||
      reportCopyScope() !== scope ||
      button?.isConnected === false
    )
      throw Error(
        "صفحه یا محدودهٔ گزارش تغییر کرد؛ گزارش را دوباره تهیه کنید.",
      );
  };
  try {
    ensureCurrent();
    const snapshot = fileMode ? null : await prepareReportSnapshot();
    ensureCurrent();
    const text = buildText(snapshot?.data || db);
    if (typeof text !== "string" || !text.length) return false;
    const html = formatHTML ? formatHTML(text) : undefined;
    if (snapshot) await assertReportSnapshot(snapshot.context);
    ensureCurrent();
    copyToClipboard(text, button, html);
    return true;
  } catch (error) {
    handleError(error);
    return false;
  }
}
