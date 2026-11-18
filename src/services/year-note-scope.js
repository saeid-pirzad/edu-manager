// Annual-note authorization and its cache belong to one service instance.
// The host supplies live state; the service never captures a writable workspace.
(function (root) {
  "use strict";
  root.EduYearNoteScope = function ({ getState, storage, termKind }) {
    let scope = { year: "", periods: [] };
    const verified = new Set();
    const accessKey = (id, password) =>
      JSON.stringify([getState().installation, id, password]);

    function permit(period, data) {
      verified.add(accessKey(period.id, data.settings.password));
    }

    function context() {
      const { workspace, password, authenticated } = getState();
      const periods = scope.year === workspace?.year ? scope.periods : [],
        authorized = periods.filter(
          (period) =>
            (period.id === workspace?.id ||
              ["first", "second"].includes(period.kind)) &&
            (period.id === workspace?.id ||
              period.password === "" ||
              (authenticated && period.password === password) ||
              verified.has(accessKey(period.id, period.password))),
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

    async function synchronize() {
      const state = getState();
      if (
        !state.connection ||
        !state.workspace ||
        state.resetBusy ||
        state.connectionRetired
      )
        return;
      const origin = {
          connection: state.connection,
          id: state.workspace.id,
          year: state.workspace.year,
        },
        tx = origin.connection.transaction(["catalog", "records"], "readonly"),
        done = storage.done(tx);
      const pending = new Promise((resolve, reject) => {
        const request = tx.objectStore("catalog").getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const periods = request.result.filter(
              (row) =>
                row.year === origin.year &&
                (row.id === origin.id ||
                  ["first", "second"].includes(
                    row.termKind || termKind(row.term),
                  )),
            ),
            metas = periods.map((period) =>
              storage.request(
                tx.objectStore("records").get(period.id + "|meta"),
              ),
            );
          Promise.all(metas).then(
            (rows) =>
              resolve(
                periods.map((period, index) => ({
                  id: period.id,
                  revision: period.revision,
                  kind: period.termKind || termKind(period.term),
                  password: rows[index]?.value?.settings?.password ?? null,
                })),
              ),
            reject,
          );
        };
      });
      const [periods] = await Promise.all([pending, done]);
      const current = getState();
      if (
        current.connection === origin.connection &&
        current.workspace?.id === origin.id &&
        current.workspace.year === origin.year &&
        !current.resetBusy &&
        !current.connectionRetired
      )
        scope = { year: origin.year, periods };
    }

    function invalidate(message) {
      if (!message?.workspace) return;
      scope.periods = scope.periods.filter(
        (period) =>
          period.id !== message.workspace ||
          (message.revision && period.revision >= message.revision),
      );
    }

    return Object.freeze({ permit, context, synchronize, invalidate });
  };
})(globalThis);
