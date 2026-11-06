// An edit lease belongs to one continuously open session dialog, not to a
// session ID forever. It is deliberately not persisted or included in backups.
let sessionEditAccess = null;

function currentSessionEditAccess(id) {
  const access = sessionEditAccess;
  return access &&
    access.sessionId === id &&
    currentSessionId === id &&
    access.workspaceId === workspace?.id &&
    access.connection === connection &&
    access.installation === installationToken &&
    access.data === db &&
    access.session === db.sessions.find((session) => session.id === id) &&
    access.root.dataset.sessionId === id &&
    access.root.isConnected &&
    document.querySelector("#modalBody .session-workspace") === access.root &&
    !document.getElementById("modal").classList.contains("hidden")
    ? access
    : null;
}

function isSessionEditable(id, token) {
  const access = currentSessionEditAccess(id);
  return !!access?.editable && (token === undefined || access.token === token);
}

function assertSessionEditable(id) {
  assertEntityWritable();
  const access = currentSessionEditAccess(id);
  if (!access?.editable)
    throw Error(
      "این جلسه فقط برای مشاهده باز شده است؛ ابتدا «فعال‌کردن ویرایش» را بزنید.",
    );
  return access.token;
}

function releaseSessionEditAccess() {
  sessionEditAccess = null;
}

function captureSessionEditRecovery() {
  const access = currentSessionEditAccess(currentSessionId);
  return access ? { access, token: access.token } : null;
}

function invalidateSessionEditRecovery(recovery) {
  if (
    recovery &&
    sessionEditAccess === recovery.access &&
    sessionEditAccess.token === recovery.token
  )
    releaseSessionEditAccess();
}

function rebindSessionEditAfterRollback(
  recovery,
  previousData,
  loaded,
  expected,
) {
  const access = recovery?.access,
    session = loaded.data.sessions.find((row) => row.id === access?.sessionId);
  if (
    !access ||
    sessionEditAccess !== access ||
    access.token !== recovery.token ||
    access.data !== previousData ||
    access.session !==
      previousData.sessions.find((row) => row.id === access.sessionId) ||
    !session ||
    ["schoolId", "classId", "lessonId"].some(
      (key) => session[key] !== access.session[key],
    ) ||
    expected.workspaceId !== workspace?.id ||
    loaded.period.id !== workspace.id ||
    loaded.period.revision !== expected.revision ||
    loaded.installationToken !== expected.installation ||
    workspace.revision !== expected.revision ||
    access.workspaceId !== workspace.id ||
    access.connection !== expected.connection ||
    connection !== expected.connection ||
    access.installation !== expected.installation ||
    installationToken !== expected.installation ||
    db !== loaded.data ||
    previousData.settings.password !== loaded.data.settings.password ||
    currentSessionId !== access.sessionId ||
    !access.root.isConnected ||
    document.querySelector("#modalBody .session-workspace") !== access.root ||
    document.getElementById("modal").classList.contains("hidden") ||
    blocked ||
    !ready ||
    fileMode ||
    workspace.closed ||
    periodLoading ||
    resetBusy ||
    connectionRetired
  ) {
    invalidateSessionEditRecovery(recovery);
    return false;
  }
  access.data = loaded.data;
  access.session = session;
  access.token = {};
  return true;
}

function sessionEditNoticeHtml(id) {
  return (
    '<aside class="session-edit-notice" role="status"><div class="session-edit-copy"><strong data-session-edit-title></strong><p data-session-edit-description></p></div>' +
    '<button type="button" class="ghost" data-session-edit-control data-mutating="1" data-workspace-action="session-toggle-edit" data-key="' +
    esc(id) +
    '">' +
    EduIcons.html("edit") +
    "<span data-session-edit-label></span></button></aside>"
  );
}

function syncSessionEditNotice() {
  const root = document.querySelector("#modalBody .session-workspace");
  if (!root) return;
  const access = currentSessionEditAccess(root.dataset.sessionId),
    editable = !!access?.editable;
  root.dataset.sessionMode = editable ? "edit" : "view";
  const modalTitle = document.getElementById("modalTitle");
  if (modalTitle)
    modalTitle.textContent = editable ? "ثبت و ویرایش جلسه" : "مشاهدهٔ جلسه";
  const title = root.querySelector("[data-session-edit-title]"),
    description = root.querySelector("[data-session-edit-description]"),
    button = root.querySelector("[data-session-edit-control]"),
    label = root.querySelector("[data-session-edit-label]");
  if (title)
    title.textContent = editable ? "ویرایش جلسه فعال است" : "فقط مشاهدهٔ جلسه";
  if (description)
    description.textContent = !access
      ? "اطلاعات این پنجره تغییر کرده است؛ جلسه را دوباره باز کنید."
      : editable
        ? "ثبت حضور و فعالیت، فوراً ذخیره می‌شود. پس از پایان کار، ویرایش را ببندید."
        : "برای جلوگیری از تغییر ناخواسته، ثبت‌های قبلی قفل‌اند. برای اصلاح، ویرایش را فعال کنید.";
  if (label) label.textContent = editable ? "پایان ویرایش" : "فعال‌کردن ویرایش";
  if (button) {
    button.setAttribute("aria-pressed", String(editable));
    setControlLock(button, "session-access-stale", !access);
  }
}

function toggleSessionEditing(button) {
  assertEntityWritable();
  const access = currentSessionEditAccess(button.dataset.key);
  if (!access || !button.isConnected || !access.root.contains(button))
    throw Error("پنجرهٔ جلسه تغییر کرده است؛ جلسه را دوباره باز کنید.");
  if (busy) throw Error("ثبت قبلی هنوز تمام نشده است؛ کمی صبر کنید.");
  access.editable = !access.editable;
  // Relocking and unlocking may never revive a callback authorized earlier.
  access.token = {};
  syncControlLocks();
}

function renderSessionDialogV24(session, options, created) {
  if (!session || !db.sessions.includes(session))
    throw Error("جلسه دیگر موجود نیست؛ فهرست را دوباره باز کنید.");
  const previousId = currentSessionId,
    previousAccess = currentSessionEditAccess(session.id),
    editable = created || !!previousAccess?.editable;
  const result = old.openSessionModal(session, options);
  if (result === false) {
    currentSessionId = previousId;
    return false;
  }
  const root = document.querySelector("#modalBody .session-workspace");
  if (!root || root.dataset.sessionId !== session.id) {
    releaseSessionEditAccess();
    return result;
  }
  sessionEditAccess = {
    sessionId: session.id,
    session,
    workspaceId: workspace?.id,
    connection,
    installation: installationToken,
    data: db,
    root,
    editable,
    token: {},
  };
  root
    .querySelector(".session-context")
    .insertAdjacentHTML("afterend", sessionEditNoticeHtml(session.id));
  // Mark non-autosaving date/period fields as writes too. Calendar clones
  // inherit the original field's lock through syncShamsiDisabledInputs.
  root
    .querySelectorAll("#sessDate,#sessPeriod,#sessPoudman,#sessUnit")
    .forEach((control) => {
      control.dataset.mutating = "1";
    });
  lockControls();
  return result;
}

function openSessionModalV24(session, options = {}) {
  return renderSessionDialogV24(session, options, false);
}

function openNewSessionDialogV24(session) {
  // Only called immediately after a successful session creation commit.
  return renderSessionDialogV24(session, {}, true);
}
