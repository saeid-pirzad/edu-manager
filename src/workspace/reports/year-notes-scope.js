// Notes share the year while protected legacy terms retain their access checks.
let academicYearNotesScope = { year: "", periods: [] };
const verifiedYearNoteAccess = new Set();
const noteAccessKey = (id, password) =>
  JSON.stringify([installationToken, id, password]);
function permitYearNoteAccess(period, data) {
  verifiedYearNoteAccess.add(noteAccessKey(period.id, data.settings.password));
}
function academicYearNotesContext() {
  const periods =
      academicYearNotesScope.year === workspace?.year
        ? academicYearNotesScope.periods
        : [],
    authorized = periods.filter(
      (period) =>
        (period.id === workspace?.id ||
          ["first", "second"].includes(period.kind)) &&
        (period.id === workspace?.id ||
          period.password === "" ||
          (isAuthenticated && period.password === db.settings.password) ||
          verifiedYearNoteAccess.has(
            noteAccessKey(period.id, period.password),
          )),
    ),
    owner =
      authorized.find((period) => period.kind === "first") ||
      authorized.find((period) => period.id === workspace?.id),
    ids = authorized.map((period) => period.id);
  if (workspace?.id && !ids.includes(workspace.id)) ids.push(workspace.id);
  return {
    notesWorkspaceId: owner?.id || workspace?.id || "",
    notesWorkspaceIds: ids,
    yearScopeId: workspace?.year || "",
  };
}
async function synchronizeYearNotesScope() {
  if (!connection || !workspace || resetBusy || connectionRetired) return;
  const origin = { connection, id: workspace.id, year: workspace.year },
    tx = connection.transaction(["catalog", "records"], "readonly"),
    done = transactionDone(tx);
  const pending = new Promise((resolve, reject) => {
    const request = tx.objectStore("catalog").getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const periods = request.result.filter(
          (row) =>
            row.year === origin.year &&
            (row.id === origin.id ||
              ["first", "second"].includes(
                row.termKind || academicTermKind(row.term),
              )),
        ),
        metas = periods.map((period) =>
          requestPromise(tx.objectStore("records").get(period.id + "|meta")),
        );
      Promise.all(metas).then(
        (rows) =>
          resolve(
            periods.map((period, index) => ({
              id: period.id,
              revision: period.revision,
              kind: period.termKind || academicTermKind(period.term),
              password: rows[index]?.value?.settings?.password ?? null,
            })),
          ),
        reject,
      );
    };
  });
  const [periods] = await Promise.all([pending, done]);
  if (
    connection === origin.connection &&
    workspace?.id === origin.id &&
    workspace.year === origin.year &&
    !resetBusy &&
    !connectionRetired
  )
    academicYearNotesScope = { year: origin.year, periods };
}
function invalidateYearNotesScope(message) {
  if (!message?.workspace) return;
  academicYearNotesScope.periods = academicYearNotesScope.periods.filter(
    (period) =>
      period.id !== message.workspace ||
      (message.revision && period.revision >= message.revision),
  );
}
