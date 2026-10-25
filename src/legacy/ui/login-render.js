      function renderLogin() {
        const app = document.getElementById("app");
        app.innerHTML = `
    <div class="login-box">
      <h2>🔒 ورود به سامانه</h2>
      <p class="muted">لطفاً رمز عبور خود را وارد کنید</p>
      <form id="loginForm">
        <input type="password" id="loginPass" placeholder="****" required autofocus>
        <button type="submit">ورود</button>
      </form>
    </div>
  `;
        app.querySelector("#loginForm").addEventListener("submit", checkPassword);
      }
      async function legacy_checkPassword(e) {
        e.preventDefault();
        const input = document.getElementById("loginPass"),
          button = e.target.querySelector("button");
        if (button) setControlLock(button, "button-operation", true);
        try {
          const password = input.value,
            stored = db.settings.password;
          if (!(await verifyPassword(password, stored))) {
            alert("رمز عبور اشتباه است.");
            input.value = "";
            return;
          }
          if (!stored.startsWith("pbkdf2$")) {
            db.settings.password = await hashPassword(password);
            await saveDB();
          }
          isAuthenticated = true;
          render();
        } catch (err) {
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
            ? `<div class="card" role="alert" style="border:2px solid #dc2626">${esc(storageProblem)} <button onclick="downloadRawRecovery()">دریافت نسخه خام</button></div>`
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

