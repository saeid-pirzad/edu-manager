async function openHistory(limit = 50) {
  const ensureCurrent = preserveAsyncTarget();
  await writer.catch(() => {});
  ensureCurrent();
  const origin = workspace.id,
    sourceConnection = connection,
    tx = sourceConnection.transaction(["events", "undo"], "readonly"),
    done = transactionDone(tx);
  // Convert synchronous request-creation errors to rejections before joining
  // them with transaction completion, so every pending promise has a handler.
  const read = async (operation) => requestPromise(operation());
  let events, undo;
  try {
    [events, undo] = await Promise.all([
      read(() => tx.objectStore("events").index("workspace").getAll(origin)),
      read(() => tx.objectStore("undo").get(origin)),
      done,
    ]);
  } catch (error) {
    try {
      tx.abort();
    } catch (ignore) {}
    await done.catch(() => {});
    throw error;
  }
  ensureCurrent();
  if (connection !== sourceConnection)
    throw Error("اتصال بانک هنگام خواندن تاریخچه تغییر کرده است.");
  events.sort((a, b) => b.id - a.id);
  showModal(
    "تاریخچه تغییرات",
    "<p>تغییرات با زمان، مقدار قبل و بعد ثبت می‌شوند. اصلاح نمره و تغییر واحد هم در این فهرست هستند.</p>" +
      (undo
        ? '<button data-mutating="1" data-workspace-action="undo">بازگردانی آخرین تغییر: ' +
          esc(undo.action) +
          "</button>"
        : "") +
      events
        .slice(0, limit)
        .map(
          (e) =>
            '<details class="card"><summary>' +
            esc(new Date(e.at).toLocaleString("fa-IR") + " — " + e.action) +
            "</summary><table><thead><tr><th>مسیر</th><th>قبل</th><th>بعد</th></tr></thead><tbody>" +
            e.changes
              .map(
                (change) =>
                  '<tr><td dir="ltr">' +
                  esc(change.path) +
                  "</td><td>" +
                  esc(JSON.stringify(change.before)) +
                  "</td><td>" +
                  esc(JSON.stringify(change.after)) +
                  "</td></tr>",
              )
              .join("") +
            "</tbody></table></details>",
        )
        .join("") +
      (events.length > limit
        ? '<button data-workspace-action="history-more" data-limit="' +
          (limit + 50) +
          '">نمایش موارد بیشتر</button>'
        : ""),
  );
}

function validatedUndoCandidate(undo, records, period) {
  return EduUndoValidator.validate(undo, records, period, {
    assertSafeDataTree,
    isDataObject,
    isSafeRecordId,
    clone,
    logicalRecordType,
    validateLogicalValue,
    decodeWorkspaceRecords,
  });
}
let undoBusy = false;
async function undoLast() {
  if (undoBusy) return false;
  undoBusy = true;
  busy++;
  paintStatus();
  try {
    const ensureCurrent = preserveAsyncTarget();
    await flushDrafts({ strict: true });
    await writer.catch(() => {});
    ensureCurrent();
    assertEntityWritable();
    const target = { id: workspace.id, revision: workspace.revision };
    const operation = performUndo(target);
    writer = operation;
    return await operation;
  } finally {
    undoBusy = false;
    busy--;
    paintStatus();
  }
}
async function performUndo(target) {
  const sourceConnection = connection;
  const isCurrentTarget = () =>
    workspace.id === target.id &&
    connection === sourceConnection &&
    !periodLoading &&
    !resetBusy &&
    !connectionRetired;
  const undo = await readRecord("undo", target.id);
  if (
    !undo ||
    !isCurrentTarget() ||
    workspace.revision !== target.revision ||
    undo.revision !== target.revision
  )
    throw Error("آخرین تغییر قابل بازگردانی نیست.");
  const candidate = validatedUndoCandidate(
    undo,
    new Map([...committed].map(([key, value]) => [key, JSON.parse(value)])),
    workspace,
  );
  if (!confirm("آخرین تغییر «" + undo.action + "» بازگردانده شود؟"))
    return false;
  assertEntityWritable();
  if (!isCurrentTarget() || workspace.revision !== target.revision)
    throw Error("دوره یا اطلاعات بازگردانی تغییر کرده است.");
  await commitRecords(candidate, {
    action: "بازگردانی: " + undo.action,
    replace: true,
    keepUndo: false,
  });
  if (!isCurrentTarget()) return true;
  const savedRevision = workspace.revision;
  const loaded = await readWorkspace(target.id);
  if (!isCurrentTarget() || workspace.revision !== savedRevision) return true;
  db = loaded.data;
  committed = loaded.records;
  closeModal();
  render();
  setStatus("آخرین تغییر بازگردانده شد.", "saved");
  return true;
}
