function renderLogin() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="login-box">
      <h2>🔒 ورود به سامانه</h2>
      <p class="muted">لطفاً رمز عبور خود را وارد کنید</p>
      <form id="loginForm">
        <input type="password" id="loginPass" aria-label="رمز عبور" autocomplete="current-password" placeholder="****" required autofocus>
        <button type="submit">ورود</button>
      </form>
    </div>
  `;
  app.querySelector("#loginForm").addEventListener("submit", checkPassword);
}
async function legacy_checkPassword(e) {
  e.preventDefault();
  const input = document.getElementById("loginPass"),
    button = e.target.querySelector("button"),
    sourceData = db,
    sourcePassword = db.settings.password,
    sourcePeriod = globalThis.EduV24?.getReportContext?.().id,
    sourceAuthentication = isAuthenticated;
  const current = () =>
    db === sourceData &&
    (!sourcePeriod ||
      globalThis.EduV24?.getReportContext?.().id === sourcePeriod);
  let migrationPending = false,
    migratedPassword;
  if (button) setControlLock(button, "button-operation", true);
  try {
    const password = input.value,
      stored = db.settings.password;
    if (!(await verifyPassword(password, stored))) {
      alert("رمز عبور اشتباه است.");
      input.value = "";
      return;
    }
    if (!current() || db.settings.password !== stored)
      throw Error("ترم یا رمز ورود تغییر کرده است؛ دوباره وارد شوید.");
    const closed = globalThis.EduV24?.getReportContext?.().closed;
    if (!closed && !stored.startsWith("pbkdf2$")) {
      const hashed = await hashPassword(password);
      if (!current() || db.settings.password !== stored)
        throw Error("ترم یا رمز ورود تغییر کرده است؛ دوباره وارد شوید.");
      // The verified session authorizes only this password migration. Closed
      // periods stay read-only; migration can wait until a later open login.
      isAuthenticated = true;
      migratedPassword = hashed;
      db.settings.password = hashed;
      migrationPending = true;
      await saveDB();
      migrationPending = false;
    }
    if (!current())
      throw Error("ترم هنگام ورود تغییر کرده است؛ دوباره وارد شوید.");
    isAuthenticated = true;
    render();
  } catch (err) {
    if (
      migrationPending &&
      (!sourcePeriod ||
        globalThis.EduV24?.getReportContext?.().id === sourcePeriod)
    ) {
      isAuthenticated = sourceAuthentication;
      if (db === sourceData && db.settings.password === migratedPassword)
        db.settings.password = sourcePassword;
      // A failed save may already have re-rendered durable data while the
      // verified migration session was temporarily authorized. Reapply the
      // restored login state so protected content cannot remain on screen.
      render();
    }
    alert("ورود انجام نشد: " + err.message);
  } finally {
    if (button) setControlLock(button, "button-operation", false);
  }
}

function legacy_render() {
  if (db.settings.password && !isAuthenticated) {
    renderLogin();
    return;
  }
  const app = document.getElementById("app");
  let h = "";
  if (state.view === "schools") h = renderSchools();
  else if (state.view === "school") h = renderSchool();
  else if (state.view === "class") h = renderClass();
  else if (state.view === "lesson") h = renderLesson();
  else if (state.view === "master") h = renderMaster();
  else if (state.view === "reports") h = renderReports();
  app.innerHTML =
    (storageBlocked
      ? `<div class="card" role="alert" style="border:2px solid #dc2626">${esc(storageProblem)} <button data-legacy-click="ui-login-render:0">دریافت نسخه خام</button></div>`
      : "") + h;

  initShamsiPickers();
  setTimeout(initShamsiPickers, 0);

  if (state.view === "reports" && state.reportTab === "comprehensive")
    setTimeout(generateGlobalReport, 0);
  if (state.view === "reports" && state.reportTab === "lessonReport")
    setTimeout(renderLessonReportTab, 0);
  if (state.view === "reports" && state.reportTab === "karnameh")
    setTimeout(renderKarnamehTabReports, 0);
  if (state.view === "lesson" && state.tab === "grades") {
    const el = document.getElementById("lessonGradesArea");
    if (el) {
      const c = getClassObj(state.schoolId, state.classId);
      const l = getLessonObj(c, state.lessonId);
      if (c && l) el.innerHTML = buildLessonGradesHtml(c, l);
    }
  }
}
