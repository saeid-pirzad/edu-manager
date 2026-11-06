// Read a year projection for display only. Stored session identities and their
// owning records never move when another assessment stage is selected.
let yearSessionRenderGeneration = 0;
async function refreshYearLessonSessions({ interactive = false } = {}) {
  const generation = ++yearSessionRenderGeneration;
  if (
    state.view !== "lesson" ||
    state.tab !== "sessions" ||
    !ready ||
    periodLoading ||
    blocked ||
    resetBusy ||
    connectionRetired ||
    (db.settings.password && !isAuthenticated)
  )
    return;
  const directory = document.querySelector("#app .session-directory");
  if (!directory) return;
  const identity = {
    workspaceId: workspace.id,
    schoolId: state.schoolId,
    classId: state.classId,
    lessonId: state.lessonId,
  };
  const current = () =>
    generation === yearSessionRenderGeneration &&
    directory.isConnected &&
    workspace.id === identity.workspaceId &&
    state.view === "lesson" &&
    state.tab === "sessions" &&
    state.schoolId === identity.schoolId &&
    state.classId === identity.classId &&
    state.lessonId === identity.lessonId;
  try {
    const snapshot = await prepareAnnualReportSnapshot(
      {},
      { partial: true, interactive },
    );
    if (!current()) return;
    const classroom = snapshot.data.schools
        .find((school) => school.id === identity.schoolId)
        ?.classes.find((item) => item.id === identity.classId),
      lesson = classroom?.lessons.find((item) => item.id === identity.lessonId);
    if (!lesson) throw Error("تعریف درس در اطلاعات سال در دسترس نیست.");
    const fragment = document.createElement("div");
    fragment.innerHTML = renderLessonSessions(classroom, lesson, {
      sourceSessions: snapshot.data.sessions,
      annual: true,
    });
    const annualDirectory = fragment.querySelector(".session-directory");
    annualDirectory.dataset.yearScope = workspace.year;
    directory.replaceWith(annualDirectory);
    EduLegacyEvents.prepare?.(annualDirectory);
    lockControls();
  } catch (error) {
    if (!current()) return;
    let notice = directory.querySelector(".year-session-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "year-session-notice control-lock-note";
      notice.setAttribute("role", "status");
      const text = document.createElement("p"),
        button = document.createElement("button");
      button.type = "button";
      button.className = "ghost";
      button.dataset.workspaceAction = "year-sessions";
      button.textContent = "بازخوانی همهٔ جلسات سال";
      notice.append(text, button);
      directory.querySelector(".session-list-heading").after(notice);
    }
    notice.querySelector("p").textContent = error.message;
  }
}
async function openYearSession(periodId, sessionId) {
  assertWorkspaceReadable();
  const origin = captureWorkspaceContext(),
    originConnection = connection,
    year = workspace.year;
  await flushDrafts({ strict: true });
  // A previous failed save already rolled back its data. Navigation must read
  // the durable snapshot rather than remain blocked by the rejected promise.
  await writer.catch(() => {});
  if (workspace.id !== origin.id || connection !== originConnection)
    throw Error("صفحه هنگام بازکردن جلسه تغییر کرد.");
  const target = await readWorkspaceSnapshot(periodId);
  if (
    workspace.id !== origin.id ||
    connection !== originConnection ||
    target.period.year !== year
  )
    throw Error("جلسه متعلق به سال فعال نیست.");
  const password = target.data.settings.password;
  let authenticated =
    !password || (isAuthenticated && password === db.settings.password);
  if (!authenticated) {
    const supplied = prompt("رمز دسترسی به سوابق این بخش از سال:");
    authenticated =
      supplied !== null && (await verifyPassword(supplied, password));
    if (!authenticated) throw Error("دسترسی به سوابق جلسه تأیید نشد.");
  }
  if (workspace.id !== origin.id || connection !== originConnection)
    throw Error("صفحه هنگام بررسی دسترسی تغییر کرد.");
  const session = target.data.sessions.find((item) => item.id === sessionId);
  if (!session)
    throw Error("این جلسه دیگر موجود نیست؛ فهرست را دوباره بخوانید.");
  if (periodId !== workspace.id) await switchPeriod(periodId);
  if (
    workspace.id !== periodId ||
    workspace.year !== year ||
    connection !== originConnection ||
    db.settings.password !== password
  )
    throw Error("اطلاعات یا دسترسی جلسه تغییر کرد؛ دوباره وارد شوید.");
  isAuthenticated = authenticated;
  state = {
    ...state,
    view: "lesson",
    schoolId: session.schoolId,
    classId: session.classId,
    lessonId: session.lessonId,
    tab: "sessions",
  };
  render();
  const live = db.sessions.find((item) => item.id === sessionId);
  if (!live)
    throw Error("جلسه هنگام بازخوانی تغییر کرد؛ فهرست را دوباره باز کنید.");
  openSessionModal(live);
}
