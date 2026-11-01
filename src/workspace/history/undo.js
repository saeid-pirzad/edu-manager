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
let undoBusy = false,
  pendingUndo = null;

async function openUndoModal() {
  if (undoBusy) return false;
  const check = preserveAsyncTarget();
  await flushDrafts({ strict: true });
  await writer.catch(() => {});
  check();
  assertEntityWritable();
  const target = { id: workspace.id, revision: workspace.revision, connection };
  const undo = await readRecord("undo", target.id);
  check();
  if (
    connection !== target.connection ||
    workspace.revision !== target.revision
  )
    throw Error("اطلاعات تغییر کرده است؛ پنجرهٔ بازگردانی را دوباره باز کنید.");
  const available = undo && undo.revision === target.revision;
  if (available)
    validatedUndoCandidate(
      undo,
      new Map([...committed].map(([key, value]) => [key, JSON.parse(value)])),
      workspace,
    );
  const date = new Date(undo?.at || "");
  const opened = showModal(
    "برگرداندن آخرین تغییر",
    '<div class="full-restore undo-preview" id="undoPreview"><section class="undo-preview-summary"><span>نوبت فعلی</span><h4>' +
      esc(workspace.year + " / " + workspace.term) +
      "</h4></section>" +
      (available
        ? '<section class="undo-preview-change"><span>تغییر قابل بازگردانی</span><h4>' +
          esc(undo.action) +
          "</h4>" +
          (Number.isFinite(date.getTime())
            ? "<p>" + esc(date.toLocaleString("fa-IR")) + "</p>"
            : "") +
          '</section><p class="undo-preview-hint">فقط آخرین تغییر ثبت‌شده به وضعیت قبل برمی‌گردد. اگر تغییر مربوط به فهرست سال تحصیلی یا نمرهٔ پودمانی باشد، تغییر مشترکِ همان سال نیز بازمی‌گردد؛ سایر سال‌ها تغییر نمی‌کنند. این کار، بازیابی فایل پشتیبان نیست.</p><p class="undo-preview-hint">پس از تأیید، امکان لغوِ همین بازگردانی وجود ندارد.</p><p id="operationError" role="alert"></p><div class="full-restore-actions"><button type="button" data-mutating="1" data-workspace-action="confirm-undo">تأیید و برگرداندن تغییر</button><button type="button" class="ghost" data-workspace-action="close">انصراف</button></div>'
        : '<p class="undo-preview-empty">در این نوبت، تغییری برای بازگرداندن وجود ندارد.</p><button type="button" class="ghost" data-workspace-action="close">بستن</button>') +
      "</div>",
  );
  if (opened !== false)
    pendingUndo = available
      ? { ...target, signature: JSON.stringify(undo) }
      : null;
  return opened !== false;
}

async function confirmUndo() {
  if (
    !pendingUndo ||
    !document.querySelector("#modal:not(.hidden) #undoPreview")
  )
    throw Error("پنجرهٔ بازگردانی منقضی شده است؛ دوباره آن را باز کنید.");
  return undoLast(pendingUndo);
}

async function undoLast(approval = null) {
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
    if (
      approval &&
      (approval !== pendingUndo ||
        target.id !== approval.id ||
        target.revision !== approval.revision ||
        connection !== approval.connection)
    )
      throw Error(
        "اطلاعات از زمان نمایش تأیید تغییر کرده است؛ پنجرهٔ بازگردانی را دوباره باز کنید.",
      );
    const operation = performUndo(target, approval);
    writer = operation;
    return await operation;
  } finally {
    undoBusy = false;
    busy--;
    paintStatus();
  }
}
async function performUndo(target, approval = null) {
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
  if (
    approval &&
    (approval !== pendingUndo ||
      JSON.stringify(undo) !== approval.signature ||
      !document.querySelector("#modal:not(.hidden) #undoPreview"))
  )
    throw Error("تغییر قابل بازگردانی عوض شده است؛ پنجره را دوباره باز کنید.");
  if (
    !approval &&
    !confirm("آخرین تغییر «" + undo.action + "» بازگردانده شود؟")
  )
    return false;
  assertEntityWritable();
  if (!isCurrentTarget() || workspace.revision !== target.revision)
    throw Error("دوره یا اطلاعات بازگردانی تغییر کرده است.");
  await commitRecords(
    candidate,
    {
      action: "بازگردانی: " + undo.action,
      replace: true,
      keepUndo: false,
    },
    undo,
  );
  pendingUndo = null;
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
