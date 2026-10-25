      globalThis.__EDU_SINGLE_FILE__ = true;
      const STORAGE_KEY = "schoolManagerDB_v22";
      const DAYS = [
        "شنبه",
        "یکشنبه",
        "دوشنبه",
        "سه‌شنبه",
        "چهارشنبه",
        "پنجشنبه",
        "جمعه",
      ];
      function finiteRatio(n, d) {
        if (d === 0n) throw Error("مخرج محاسبه نمره صفر است.");
        if (n === 0n) return 0;
        const negative = n < 0n !== d < 0n;
        n = n < 0n ? -n : n;
        d = d < 0n ? -d : d;
        let exponent = n.toString().length - d.toString().length;
        if (
          exponent >= 0
            ? n < d * 10n ** BigInt(exponent)
            : n * 10n ** BigInt(-exponent) < d
        )
          exponent--;
        const scale = 20 - exponent;
        const numerator = scale >= 0 ? n * 10n ** BigInt(scale) : n;
        const denominator = scale >= 0 ? d : d * 10n ** BigInt(-scale);
        const significant = (numerator + denominator / 2n) / denominator;
        const result = Number(
          (negative ? "-" : "") + significant.toString() + "e" + String(-scale),
        );
        if (!Number.isFinite(result))
          throw Error("نتیجه محاسبه نمره خارج از دامنه معتبر است.");
        return result;
      }
      function reduceGradeFraction(n, d) {
        let a = n < 0n ? -n : n,
          b = d;
        while (b) {
          const remainder = a % b;
          a = b;
          b = remainder;
        }
        return { n: n / (a || 1n), d: d / (a || 1n) };
      }
      const TYPE_LABELS = {
        mostamar: "مستمر",
        payani: "پایانی",
        positive: "مثبت",
        negative: "منفی",
        classGrade: "نمره کلاسی",
        activity: "امتیاز فعالیت",
        homework: "تکلیف",
      };
      const COLORS = [
        "#4f46e5",
        "#0891b2",
        "#059669",
        "#d97706",
        "#dc2626",
        "#7c3aed",
        "#db2777",
        "#0284c7",
        "#65a30d",
        "#9333ea",
      ];

      // Shared data-boundary rules; grading maps only read their own records.
      const RESERVED_RECORD_IDS = new Set([
        "__proto__",
        "constructor",
        "prototype",
        ...Object.getOwnPropertyNames(Object.prototype),
      ]);
      function isDataObject(value) {
        return (
          value !== null && typeof value === "object" && !Array.isArray(value)
        );
      }
      function isSafeRecordId(value) {
        return (
          typeof value === "string" &&
          /^[A-Za-z0-9_-]{1,120}$/.test(value) &&
          !RESERVED_RECORD_IDS.has(value)
        );
      }
      function assertSafeDataTree(value) {
        const pending = [value],
          seen = new WeakSet();
        while (pending.length) {
          const current = pending.pop();
          if (!current || typeof current !== "object" || seen.has(current))
            continue;
          seen.add(current);
          for (const key of Object.keys(current)) {
            if (["__proto__", "constructor", "prototype"].includes(key))
              throw Error("کلید غیرمجاز در داده ورودی.");
            pending.push(current[key]);
          }
        }
      }
      function ownScoreRecord(source, id) {
        const value =
          isDataObject(source) && Object.hasOwn(source, id) ? source[id] : null;
        return Object.assign(
          Object.create(null),
          isDataObject(value) ? value : null,
        );
      }
      function writableScoreRecord(source, id) {
        if (!isDataObject(source) || !isSafeRecordId(id))
          throw Error("شناسه یا مخزن نمره نامعتبر است.");
        const record = ownScoreRecord(source, id);
        source[id] = record;
        return record;
      }
      function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      }
      function todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      function faDate(iso) {
        if (!iso) return "";
        try {
          return new Date(iso + "T00:00:00").toLocaleDateString("fa-IR");
        } catch (e) {
          return iso;
        }
      }
      function toShamsi(iso) {
        return faDate(iso);
      }
      function esc(s) {
        return String(s ?? "").replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
      }
      function todayIdx() {
        return (new Date().getDay() + 1) % 7;
      }
      function clamp(v, a, b) {
        return Math.max(a, Math.min(b, v));
      }
      function getDayIdxFromDate(dateStr) {
        return (new Date(dateStr + "T00:00:00").getDay() + 1) % 7;
      }
      function getPeriodName(p) {
        return `زنگ ${p + 1}`;
      }

      // ==================== تقویم شمسی ====================
      function toFaNum(num) {
        const faDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
        return String(num).replace(/\d/g, (d) => faDigits[d]);
      }
      function getSortedStudents(classObj) {
        if (!classObj || !classObj.students) return [];
        const collator = new Intl.Collator("fa", { sensitivity: "base" });
        return [...classObj.students].sort((a, b) => {
          const aParts = a.name.trim().split(" ");
          const bParts = b.name.trim().split(" ");
          const aFamily =
            aParts.length > 1 ? aParts[aParts.length - 1] : a.name;
          const bFamily =
            bParts.length > 1 ? bParts[bParts.length - 1] : b.name;
          const familyCompare = collator.compare(aFamily, bFamily);
          if (familyCompare !== 0) return familyCompare;
          return collator.compare(a.name, b.name);
        });
      }

      function makeDefaultPoudmans() {
        return Array.from({ length: 5 }, (_, i) => ({
          id: "p" + uid() + i,
          name: "پودمان " + (i + 1),
          units: [
            {
              id: "u" + uid() + i + "a",
              name: "واحد ۱",
              unitScores: {},
              applyOptions: {
                pos: false,
                neg: false,
                hw: false,
                present: false,
                late: false,
              },
            },
            {
              id: "u" + uid() + i + "b",
              name: "واحد ۲",
              unitScores: {},
              applyOptions: {
                pos: false,
                neg: false,
                hw: false,
                present: false,
                late: false,
              },
            },
          ],
        }));
      }
      function defaultDB() {
        return {
          schools: [],
          sessions: [],
          masterSchedule: {},
          activeDays: [0, 1, 2, 3, 4, 5],
          periods: 6,
          settings: {
            weekStartDate: todayISO(),
            academicYear: "۱۴۰۳-۱۴۰۴",
            password: "",
          },
        };
      }
      let storageSnapshot = null,
        storageBlocked = false,
        storageProblem = "";
      let db = loadDB();
      let state = {
        view: "schools",
        schoolId: null,
        classId: null,
        lessonId: null,
        tab: "students",
        masterFilter: null,
        reportTab: "comprehensive",
      };
      let currentSessionId = null;
      let isAuthenticated = false;

      let globalFilter = {
        schoolId: "",
        classId: "",
        lessonId: "",
        studentId: "",
        period: "",
        date: "",
        showAttendance: true,
        showScores: true,
        showPosNeg: true,
        showHomework: true,
        reportMode: "detailed",
        showPresentNames: true,
        showAbsentNames: true,
        showLateNames: true,
      };
      let lessonReportFilter = { schoolId: "", classId: "", lessonId: "" };
      let karnamehFilter = { schoolId: "", classId: "", studentId: "" };

      function loadDB() {
        try {
          storageSnapshot = localStorage.getItem(STORAGE_KEY);
          if (storageSnapshot) return prepareDB(JSON.parse(storageSnapshot));
        } catch (e) {
          storageBlocked = true;
          storageProblem =
            "داده قابل خواندن نیست؛ ذخیره مسدود شد. نسخه خام را دریافت و پشتیبان سالم بازیابی کنید.";
          console.error(e);
        }
        return defaultDB();
      }

      function migrateUnitScores(d) {
        (d.schools || []).forEach((s) =>
          s.classes.forEach((c) => {
            (c.lessons || []).forEach((l) => {
              (l.poudmans || []).forEach((p) => {
                (p.units || []).forEach((u) => {
                  if (!u.unitScores) u.unitScores = {};
                  if (!u.applyOptions) u.applyOptions = {};
                  u.applyOptions = Object.assign(
                    {
                      pos: false,
                      neg: false,
                      hw: false,
                      present: false,
                      late: false,
                    },
                    u.applyOptions,
                  );
                });
              });
            });
          }),
        );
      }

      function migrateToMaster(d) {
        if (!d.masterSchedule) d.masterSchedule = {};
        if (!d.periods) {
          let mx = 6;
          (d.schools || []).forEach((s) =>
            s.classes.forEach((c) => {
              if (c.periods > mx) mx = c.periods;
            }),
          );
          d.periods = mx;
        }
        if (!d.activeDays) d.activeDays = [0, 1, 2, 3, 4, 5];
      }

      function saveDB() {
        try {
          if (storageBlocked) throw Error(storageProblem);
          if (localStorage.getItem(STORAGE_KEY) !== storageSnapshot)
            throw Error(
              "داده در تب دیگری تغییر کرده؛ صفحه را دوباره بارگذاری کنید.",
            );
          const next = prepareDB(db),
            raw = JSON.stringify(next);
          localStorage.setItem(STORAGE_KEY, raw);
          storageSnapshot = raw;
          db = next;
          return true;
        } catch (e) {
          try {
            db = storageSnapshot
              ? prepareDB(JSON.parse(storageSnapshot))
              : defaultDB();
          } catch (ignore) {}
          alert("ذخیره انجام نشد؛ تغییر اخیر ثبت نشده است. " + e.message);
          throw e;
        }
      }
      function getSchool(id) {
        return db.schools.find((s) => s.id === id);
      }
      function getClassObj(sId, cId) {
        const s = getSchool(sId);
        return s ? s.classes.find((c) => c.id === cId) : null;
      }
      function getLessonObj(cObj, lId) {
        return cObj ? (cObj.lessons || []).find((l) => l.id === lId) : null;
      }
      function getStudentObj(cObj, stId) {
        return cObj
          ? [...cObj.students, ...(cObj.archivedStudents || [])].find(
              (s) => s.id === stId,
            )
          : null;
      }
      function findClassById(cId) {
        for (const s of db.schools) {
          const c = s.classes.find((x) => x.id === cId);
          if (c) return { school: s, classObj: c };
        }
        return null;
      }
      function getClassColor(cId) {
        const all = [];
        db.schools.forEach((s) => s.classes.forEach((c) => all.push(c.id)));
        const idx = all.indexOf(cId);
        return idx >= 0 ? COLORS[idx % COLORS.length] : "#64748b";
      }
      function getSaturdayOf(dateStr) {
        const d = new Date(dateStr + "T00:00:00");
        d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      function getWeekParity(dateStr) {
        const start = getSaturdayOf(db.settings.weekStartDate || todayISO());
        const target = getSaturdayOf(dateStr || todayISO());
        const weeks = Math.round(
          (new Date(target + "T00:00:00") - new Date(start + "T00:00:00")) /
            (7 * 24 * 60 * 60 * 1000),
        );
        return weeks % 2 === 0 ? "odd" : "even";
      }
      function getMasterEntry(day, period, dateStr) {
        const parity = getWeekParity(dateStr);
        const m = db.masterSchedule || {};
        return (
          m[`${day}-${period}-${parity}`] || m[`${day}-${period}-all`] || null
        );
      }
      function getBothEntries(day, period) {
        const m = db.masterSchedule || {};
        return {
          all: m[`${day}-${period}-all`] || null,
          odd: m[`${day}-${period}-odd`] || null,
          even: m[`${day}-${period}-even`] || null,
        };
      }

      // ==================== ناوبری ====================
      function goSchools() {
        state = {
          view: "schools",
          schoolId: null,
          classId: null,
          lessonId: null,
          tab: "students",
          masterFilter: null,
          reportTab: "comprehensive",
        };
        render();
      }
      function goSchool(id) {
        state.view = "school";
        state.schoolId = id;
        state.classId = null;
        state.lessonId = null;
        render();
      }
      function goClass(id) {
        state.view = "class";
        state.classId = id;
        state.lessonId = null;
        state.tab = "students";
        render();
      }
      function goLesson(id) {
        state.view = "lesson";
        state.lessonId = id;
        state.tab = "sessions";
        render();
      }
      function backToClass() {
        state.view = "class";
        state.lessonId = null;
        state.tab = "lessons";
        render();
      }
      function goMaster(filterClassId) {
        state.view = "master";
        state.masterFilter = filterClassId || null;
        render();
      }
      function goReports() {
        state.view = "reports";
        state.reportTab = ["daily", "weekly", "monthly", "annual"].includes(
          state.reportTab,
        )
          ? state.reportTab
          : "daily";
        render();
      }
      function setTab(t) {
        state.tab = t;
        render();
      }
      function setReportTab(t) {
        state.reportTab = t;
        render();
      }

      function renderLogin() {
        const app = document.getElementById("app");
        app.innerHTML = `
    <div class="login-box">
      <h2>🔒 ورود به سامانه</h2>
      <p class="muted">لطفاً رمز عبور خود را وارد کنید</p>
      <form onsubmit="checkPassword(event)">
        <input type="password" id="loginPass" placeholder="****" required autofocus>
        <button type="submit">ورود</button>
      </form>
    </div>
  `;
      }
      async function checkPassword(e) {
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

      function render() {
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

      function headerHtml() {
        const icon = (path) =>
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
          path +
          '"/></svg>';
        const icons = {
          school:
            "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 9h1M15 9h1M8 12h1M15 12h1",
          report: "M4 3v18h17M8 17v-5M13 17V8M18 17V5",
          calendar: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2",
          settings:
            "M9 4h6l1 3 3 1 1 6-3 2-1 3H9l-1-3-3-2 1-6 3-1 1-3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
          data: "M4 5h16v15H4zM4 9h16M8 13h8M8 16h5",
          home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
          book: "M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15",
          copy: "M8 3h12v14H8zM4 7v14h12",
          upload: "M12 16V3M7 8l5-5 5 5M4 15v6h16v-6",
          trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
        };
        const btn = (label, key, action, active = false, extra = "") =>
          '<button type="button" class="header-action' +
          (active ? " is-active" : "") +
          '" onclick="' +
          action +
          '" ' +
          (active ? 'aria-current="page" ' : "") +
          extra +
          ">" +
          icon(icons[key]) +
          "<span>" +
          label +
          "</span></button>";
        const caret =
          '<svg class="header-caret" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>';
        const sub = (label, key, action, danger = false) =>
          '<button type="button" ' +
          (danger ? 'class="danger-item" ' : "") +
          'onclick="' +
          action +
          '">' +
          icon(icons[key]) +
          "<span>" +
          label +
          "</span></button>";
        let h =
          '<div class="topbar"><div class="header-brand"><h1>مدیریت کلاس</h1>';
        h += btn(
          "خانه",
          "home",
          "goSchools()",
          state.view === "schools",
          'aria-label="خانه"',
        ).replace('class="header-action', 'class="header-home header-action');
        h += '</div><div class="actions header-actions">';
        h +=
          btn("گزارش‌ها", "report", "goReports()", state.view === "reports") +
          btn(
            "برنامه هفتگی",
            "calendar",
            "goMaster()",
            state.view === "master",
          );
        h +=
          '<div class="header-dropdown">' +
          btn(
            "داده‌ها",
            "data",
            "toggleDataMenu(event)",
            false,
            'id="dataMenuButton" aria-controls="dataMenu" aria-expanded="false"',
          ).replace("</button>", caret + "</button>") +
          '<div class="data-menu" id="dataMenu" aria-label="مدیریت داده‌ها">' +
          sub("پشتیبان‌گیری", "copy", "closeDataMenu();exportBackup()") +
          sub(
            "بازیابی از فایل",
            "upload",
            "closeDataMenu();document.getElementById(\'importFile\').click()",
          ) +
          sub(
            "حذف کامل داده‌ها",
            "trash",
            "closeDataMenu();wipeAllData()",
            true,
          ) +
          "</div></div>";
        h += btn("تنظیمات", "settings", "openSettingsModal()") + "</div></div>";
        return h;
      }
      function setHeaderMenu(id, open) {
        const menu = document.getElementById(id),
          button = document.getElementById(id + "Button");
        menu?.classList.toggle("open", open);
        button?.setAttribute("aria-expanded", String(open));
      }
      function toggleClassMenu(e) {
        e.stopPropagation();
        const open = !document
          .getElementById("classMenu")
          ?.classList.contains("open");
        closeDataMenu();
        setHeaderMenu("classMenu", open);
      }
      function closeClassMenu() {
        setHeaderMenu("classMenu", false);
      }
      function toggleDataMenu(e) {
        e.stopPropagation();
        const open = !document
          .getElementById("dataMenu")
          ?.classList.contains("open");
        closeClassMenu();
        setHeaderMenu("dataMenu", open);
      }

      const contextualMenuSelector =
        ".dashboard-entity-more,.lesson-more,.student-more,.session-list-actions";
      function closeContextualMenus(except = null) {
        for (const menu of document.querySelectorAll(contextualMenuSelector))
          if (menu !== except && menu.open) menu.open = false;
      }
      document.addEventListener(
        "toggle",
        (event) => {
          if (
            event.target.matches?.(contextualMenuSelector) &&
            event.target.open
          )
            closeContextualMenus(event.target);
        },
        true,
      );
      document.addEventListener("click", (event) => {
        const current = event.target.closest?.(contextualMenuSelector);
        if (current && event.target.closest("button,a"))
          current.querySelector("summary")?.focus({ preventScroll: true });
        closeContextualMenus(
          current && !event.target.closest("button,a") ? current : null,
        );
      });
      function closeDataMenu() {
        setHeaderMenu("dataMenu", false);
      }
      document.addEventListener("click", (e) => {
        closeClassMenu();
        closeDataMenu();
        const nav = document.querySelector(".navigation-menu");
        if (
          nav &&
          !e.target.closest(".navigation-menu") &&
          matchMedia(
            "(max-width:700px), (max-width:1000px) and (pointer:coarse)",
          ).matches
        )
          nav.open = false;
      });
      document.addEventListener("keydown", (e) => {
        if (
          e.key !== "Escape" ||
          !document.getElementById("modal").classList.contains("hidden")
        )
          return;
        const contextMenu = document.querySelector(
          ".dashboard-entity-more[open],.lesson-more[open],.student-more[open],.session-list-actions[open]",
        );
        if (contextMenu) {
          contextMenu.open = false;
          contextMenu.querySelector("summary")?.focus();
          e.preventDefault();
          return;
        }
        const nav = document.querySelector(".navigation-menu");
        if (
          nav?.open &&
          !document.querySelector(".header-dropdown .data-menu.open") &&
          matchMedia(
            "(max-width:700px), (max-width:1000px) and (pointer:coarse)",
          ).matches
        ) {
          nav.open = false;
          nav.querySelector("summary")?.focus();
          e.preventDefault();
          return;
        }
        const open = document.querySelector(".header-dropdown .data-menu.open");
        if (open) {
          const button = document.getElementById(open.id + "Button");
          closeClassMenu();
          closeDataMenu();
          button?.focus();
          e.preventDefault();
        }
      });

      function goCurrentClass() {
        if (state.classId) {
          goClass(state.classId);
        } else if (state.schoolId) {
          const school = getSchool(state.schoolId);
          if (school && school.classes.length > 0)
            goClass(school.classes[0].id);
          else goSchool(state.schoolId);
        } else {
          if (db.schools.length > 0 && db.schools[0].classes.length > 0) {
            state.schoolId = db.schools[0].id;
            goClass(db.schools[0].classes[0].id);
          } else if (db.schools.length > 0) {
            goSchool(db.schools[0].id);
          } else {
            goSchools();
          }
        }
      }

      function goCurrentLesson() {
        if (state.lessonId) {
          goLesson(state.lessonId);
        } else if (state.classId) {
          const cls = getClassObj(state.schoolId, state.classId);
          if (cls && cls.lessons && cls.lessons.length > 0) {
            goLesson(cls.lessons[0].id);
          } else {
            goClass(state.classId);
          }
        } else if (state.schoolId) {
          const school = getSchool(state.schoolId);
          if (school && school.classes.length > 0) {
            const firstClass = school.classes[0];
            if (firstClass.lessons && firstClass.lessons.length > 0) {
              goLesson(firstClass.lessons[0].id);
            } else {
              goClass(firstClass.id);
            }
          } else {
            goSchool(state.schoolId);
          }
        } else {
          if (db.schools.length > 0 && db.schools[0].classes.length > 0) {
            const firstClass = db.schools[0].classes[0];
            if (firstClass.lessons && firstClass.lessons.length > 0) {
              goLesson(firstClass.lessons[0].id);
            } else {
              goClass(firstClass.id);
            }
          } else if (db.schools.length > 0) {
            goSchool(db.schools[0].id);
          } else {
            goSchools();
          }
        }
      }

      // ==================== سیستم کپی ====================
      function copyToClipboard(text, btn) {
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard
            .writeText(text)
            .then(() => showSuccessCopy(btn))
            .catch(() => fallbackCopyTextToClipboard(text, btn));
        } else {
          fallbackCopyTextToClipboard(text, btn);
        }
      }
      function fallbackCopyTextToClipboard(text, btn) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.width = "2em";
        textArea.style.height = "2em";
        textArea.style.padding = "0";
        textArea.style.border = "none";
        textArea.style.outline = "none";
        textArea.style.boxShadow = "none";
        textArea.style.background = "transparent";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          if (document.execCommand("copy")) showSuccessCopy(btn);
          else showTextModal(text);
        } catch (err) {
          showTextModal(text);
        }
        document.body.removeChild(textArea);
      }
      function showSuccessCopy(btn) {
        if (!btn) return;
        const old = btn.textContent;
        btn.textContent = "✅ کپی شد!";
        setTimeout(() => (btn.textContent = old), 2000);
      }
      function showTextModal(text) {
        let h = `<p class="muted" style="margin-top:0">مرورگر شما اجازه کپی خودکار را نداد. لطفاً متن زیر را انتخاب کرده و دستی کپی کنید:</p>
    <textarea class="report-text-area" readonly onclick="this.select()">${text}</textarea>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button onclick="closeModal()">بستن</button></div>`;
        showModal("متن گزارش", h);
      }

      // ==================== صفحه گزارش ====================

      function renderReports() {
        const tab = state.reportTab || "comprehensive";
        const periodic = ["daily", "weekly", "monthly", "annual"].includes(tab);
        const periodicContent = periodic ? EduPeriodicReports.render(tab) : "";
        const filter = periodic
          ? EduPeriodicReports.filters
          : tab === "comprehensive"
            ? globalFilter
            : tab === "lessonReport"
              ? lessonReportFilter
              : karnamehFilter;
        const schools = db.schools.filter(
            (s) => !filter.schoolId || s.id === filter.schoolId,
          ),
          classes = schools
            .flatMap((s) => s.classes)
            .filter((c) => !filter.classId || c.id === filter.classId);
        const scope =
          (filter.schoolId ? schools[0]?.name : "همه مدارس") ||
          "مدرسه انتخاب‌شده";
        let h =
          headerHtml() +
          '<header class="report-page-heading"><p>تصویر روشن از عملکرد کلاس‌ها</p><h2>گزارش‌ها و کارنامه‌ها</h2><span>' +
          esc(scope) +
          (filter.classId
            ? " · " + esc(classes[0]?.name || "کلاس انتخاب‌شده")
            : "") +
          "</span></header>";
        h +=
          '<section class="report-scope-summary no-print"><span><strong>' +
          classes.length.toLocaleString("fa-IR") +
          "</strong> کلاس</span><span><strong>" +
          classes
            .reduce((n, c) => n + c.students.length, 0)
            .toLocaleString("fa-IR") +
          "</strong> هنرجو</span><span><strong>" +
          classes
            .reduce((n, c) => n + (c.lessons || []).length, 0)
            .toLocaleString("fa-IR") +
          "</strong> درس در محدوده</span></section>";
        h +=
          '<nav class="tabs report-navigation no-print" aria-label="نوع گزارش">' +
          [
            ["daily", "روزانه"],
            ["weekly", "هفتگی"],
            ["monthly", "ماهانه"],
            ["annual", "سالانه"],
          ]
            .map(
              ([key, label]) =>
                '<button type="button" ' +
                (tab === key ? 'aria-current="page" ' : "") +
                'class="' +
                (tab === key ? "active" : "") +
                '" onclick="setReportTab(\'' +
                key +
                "')\">" +
                label +
                "</button>",
            )
            .join("") +
          "</nav>";
        h +=
          '<details class="report-extra no-print"><summary>کارنامه و گزارش‌های دیگر</summary><div class="row"><button class="ghost" onclick="setReportTab(\'karnameh\')">کارنامه نمرات</button><button class="ghost" onclick="setReportTab(\'comprehensive\')">ریز فعالیت‌ها</button><button class="ghost" onclick="setReportTab(\'lessonReport\')">گزارش دروس</button></div></details>';
        if (tab === "comprehensive") h += renderComprehensiveTab();
        else if (tab === "lessonReport") h += renderLessonReportTabHtml();
        else if (periodic) h += periodicContent;
        else h += renderKarnamehTabHtml();
        return h;
      }

      // --- زیربخش ۱: گزارش جامع ---
      function renderComprehensiveTab() {
        let h = `<div class="card">
    <h3>گزارش فعالیت‌ها</h3>
    <p class="muted" style="font-size:.85em">گزارش مدیریتی جلسات ثبت‌شده. برای ارسال به اولیا، گزارش روزانه یا هفتگی را با مخاطب «اولیا» تهیه کنید.</p>
    <div class="row">
      <input type="date" value="${globalFilter.date}" onchange="updateGlobalFilter('date', this.value)" title="فیلتر تاریخ">
      <select onchange="updateGlobalFilter('schoolId', this.value)">
        <option value="">همه مدارس</option>
        ${db.schools.map((s) => `<option value="${s.id}" ${globalFilter.schoolId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
      </select>
      <select onchange="updateGlobalFilter('classId', this.value)">
        <option value="">همه کلاس‌ها</option>
        ${db.schools
          .filter(
            (s) => !globalFilter.schoolId || s.id === globalFilter.schoolId,
          )
          .map((s) =>
            s.classes
              .map(
                (c) =>
                  `<option value="${c.id}" ${globalFilter.classId === c.id ? "selected" : ""}>${esc(s.name)} / ${esc(c.name)}</option>`,
              )
              .join(""),
          )
          .join("")}
      </select>
      <select onchange="updateGlobalFilter('lessonId', this.value)">
        <option value="">همه دروس</option>
        ${db.schools
          .filter(
            (s) => !globalFilter.schoolId || s.id === globalFilter.schoolId,
          )
          .map((s) => s.classes)
          .flat()
          .filter((c) => !globalFilter.classId || c.id === globalFilter.classId)
          .map((c) =>
            (c.lessons || [])
              .map(
                (l) =>
                  `<option value="${l.id}" ${globalFilter.lessonId === l.id ? "selected" : ""}>${esc(c.name)} - ${esc(l.name)}</option>`,
              )
              .join(""),
          )
          .join("")}
      </select>
      <select onchange="updateGlobalFilter('studentId', this.value)">
        <option value="">همه دانش‌آموزان</option>
        ${db.schools
          .filter(
            (s) => !globalFilter.schoolId || s.id === globalFilter.schoolId,
          )
          .map((s) => s.classes)
          .flat()
          .filter((c) => !globalFilter.classId || c.id === globalFilter.classId)
          .map((c) =>
            getSortedStudents(c)
              .map(
                (st) =>
                  `<option value="${st.id}" ${globalFilter.studentId === st.id ? "selected" : ""}>${esc(st.name)}</option>`,
              )
              .join(""),
          )
          .join("")}
      </select>
      <select onchange="updateGlobalFilter('period', this.value)">
        <option value="">همه زنگ‌ها</option>
        ${Array.from({ length: 12 }, (_, i) => `<option value="${i}" ${globalFilter.period == String(i) ? "selected" : ""}>زنگ ${i + 1}</option>`).join("")}
      </select>
    </div>
    <div class="filter-box">
      <div style="font-size:.9em;font-weight:600;color:#475569;margin-bottom:8px">حالت نمایش گزارش:</div>
      <div class="row" style="margin-bottom:12px">
        <label><input type="radio" name="reportMode" value="summary" ${globalFilter.reportMode === "summary" ? "checked" : ""} onchange="updateGlobalFilter('reportMode', this.value)"> خلاصه (جدولی)</label>
        <label><input type="radio" name="reportMode" value="detailed" ${globalFilter.reportMode === "detailed" ? "checked" : ""} onchange="updateGlobalFilter('reportMode', this.value)"> گزارش کامل</label>
      </div>
      <div style="font-size:.9em;font-weight:600;color:#475569;margin-bottom:8px">اطلاعات موجود در گزارش:</div>
      <div class="row" style="margin-bottom:8px">
        <label><input type="checkbox" ${globalFilter.showAttendance ? "checked" : ""} onchange="updateGlobalFilter('showAttendance', this.checked)"> حضور و غیاب</label>
        <label><input type="checkbox" ${globalFilter.showScores ? "checked" : ""} onchange="updateGlobalFilter('showScores', this.checked)"> نمرات</label>
        <label><input type="checkbox" ${globalFilter.showPosNeg ? "checked" : ""} onchange="updateGlobalFilter('showPosNeg', this.checked)"> مثبت / منفی</label>
        <label><input type="checkbox" ${globalFilter.showHomework ? "checked" : ""} onchange="updateGlobalFilter('showHomework', this.checked)"> تکالیف</label>
      </div>
      <div style="font-size:.9em;font-weight:600;color:#475569;margin-bottom:8px">نمایش اسامی (برای حضور و غیاب):</div>
      <div class="row" style="margin-bottom:0">
        <label style="color:#059669"><input type="checkbox" ${globalFilter.showPresentNames ? "checked" : ""} onchange="updateGlobalFilter('showPresentNames', this.checked)"> نام حاضرین</label>
        <label style="color:#dc2626"><input type="checkbox" ${globalFilter.showAbsentNames ? "checked" : ""} onchange="updateGlobalFilter('showAbsentNames', this.checked)"> نام غایبین</label>
        <label style="color:#d97706"><input type="checkbox" ${globalFilter.showLateNames ? "checked" : ""} onchange="updateGlobalFilter('showLateNames', this.checked)"> نام تأخیری‌ها</label>
        <button class="ghost" onclick="resetGlobalFilters()" style="margin-right:auto;font-size:.85em;padding:4px 10px">♻️ ریست فیلترها</button>
      </div>
    </div>
  </div>
  <div id="globalReportOutput"></div>`;
        return h;
      }

      function updateGlobalFilter(key, val) {
        globalFilter[key] = val;
        if (key === "schoolId") {
          globalFilter.classId = "";
          globalFilter.lessonId = "";
          globalFilter.studentId = "";
        }
        if (key === "classId") {
          globalFilter.lessonId = "";
          globalFilter.studentId = "";
        }
        render();
      }
      function resetGlobalFilters() {
        globalFilter = {
          schoolId: "",
          classId: "",
          lessonId: "",
          studentId: "",
          period: "",
          date: "",
          showAttendance: true,
          showScores: true,
          showPosNeg: true,
          showHomework: true,
          reportMode: "detailed",
          showPresentNames: true,
          showAbsentNames: true,
          showLateNames: true,
        };
        render();
      }

      function getFilteredSessions() {
        return db.sessions
          .filter((s) => {
            if (globalFilter.date && s.date !== globalFilter.date) return false;
            if (globalFilter.schoolId && s.schoolId !== globalFilter.schoolId)
              return false;
            if (globalFilter.classId && s.classId !== globalFilter.classId)
              return false;
            if (globalFilter.lessonId && s.lessonId !== globalFilter.lessonId)
              return false;
            if (globalFilter.period && String(s.period) !== globalFilter.period)
              return false;
            if (globalFilter.studentId) {
              const hasAtt = s.attendance[globalFilter.studentId] !== undefined;
              const hasScore = s.scores.some(
                (x) => x.studentId === globalFilter.studentId,
              );
              const roster =
                s.roster || getClassObj(s.schoolId, s.classId)?.students || [];
              if (
                !hasAtt &&
                !hasScore &&
                !roster.some((st) => st.id === globalFilter.studentId)
              )
                return false;
            }
            return true;
          })
          .sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return a.period - b.period;
          });
      }

      function generateGlobalReport() {
        const out = document.getElementById("globalReportOutput");
        if (!out) return;
        const filteredSessions = getFilteredSessions();
        let h = `<div class="card">
    <div class="row no-print" style="justify-content:space-between;align-items:center">
      <h3 style="margin:0">📋 نتیجه گزارش (${filteredSessions.length} جلسه)</h3>
      <div>
        <button class="success" onclick="copyGlobalReportText(this)">📋 کپی متن</button>
        <button onclick="EduV24.printReport(this)">🖨️ چاپ / PDF</button>
      </div>
    </div>`;
        if (filteredSessions.length === 0) {
          h += `<div class="empty">هیچ جلسه‌ای با این فیلترها یافت نشد.</div></div>`;
          out.innerHTML = h;
          return;
        }

        if (globalFilter.reportMode === "summary") {
          let headers = ["تاریخ", "کلاس", "درس", "زنگ"];
          if (globalFilter.studentId) {
            if (globalFilter.showAttendance) headers.push("وضعیت");
            if (globalFilter.showScores) headers.push("مستمر/پایانی");
            if (globalFilter.showPosNeg) headers.push("مثبت", "منفی");
            if (globalFilter.showHomework) headers.push("تکلیف");
          } else {
            if (globalFilter.showAttendance) headers.push("حضور/غیاب");
            if (globalFilter.showScores) headers.push("نمرات");
            if (globalFilter.showPosNeg) headers.push("مثبت", "منفی");
            if (globalFilter.showHomework) headers.push("تکلیف");
          }
          h += `<div style="overflow-x:auto;"><table class="karnameh-table"><thead><tr>`;
          headers.forEach((header) => {
            h += `<th>${header}</th>`;
          });
          h += `</tr></thead><tbody>`;
          filteredSessions.forEach((sess) => {
            const cls = findClassById(sess.classId);
            const lesson = getLessonObj(cls.classObj, sess.lessonId);
            h += `<tr><td>${faDate(sess.date)}</td><td>${esc(cls.classObj.name)}</td><td>${esc(lesson.name)}</td><td>زنگ ${sess.period + 1}</td>`;
            if (globalFilter.studentId) {
              if (globalFilter.showAttendance) {
                const st = sess.attendance[globalFilter.studentId];
                let attText = '<span class="muted">ثبت نشده</span>';
                if (st === "present")
                  attText = '<span class="badge present">حاضر</span>';
                else if (st === "absent")
                  attText = '<span class="badge absent">غایب</span>';
                else if (st && st.startsWith("late")) {
                  const mins = st.includes(":") ? st.split(":")[1] : "";
                  attText = `<span class="badge late">تأخیر ${mins ? "(" + mins + "د)" : ""}</span>`;
                }
                h += `<td>${attText}</td>`;
              }
              const myScores = sess.scores.filter(
                (x) => x.studentId === globalFilter.studentId,
              );
              if (globalFilter.showScores) {
                const ms = myScores
                  .filter((x) => x.type === "mostamar")
                  .map((x) => `${x.value}`)
                  .map(esc)
                  .join("، ");
                const ps = myScores
                  .filter((x) => x.type === "payani")
                  .map((x) => `${x.value}`)
                  .map(esc)
                  .join("، ");
                const classMarks = myScores
                  .filter((score) => score.type === "classGrade")
                  .map((score) => score.value)
                  .join("، ");
                h +=
                  "<td>" +
                  (ms || "—") +
                  " / " +
                  (ps || "—") +
                  (classMarks ? "<br>کلاسی: " + esc(classMarks) : "") +
                  "</td>";
              }
              if (globalFilter.showPosNeg) {
                const pos = myScores.filter((x) => x.type === "positive");
                const neg = myScores.filter((x) => x.type === "negative");
                h += `<td>${
                  pos.length
                    ? pos
                        .map((x) => `(${x.value})`)
                        .map(esc)
                        .join("، ")
                    : '<span class="muted">0</span>'
                }</td>`;
                h += `<td>${
                  neg.length
                    ? neg
                        .map((x) => `(${x.value})`)
                        .map(esc)
                        .join("، ")
                    : '<span class="muted">0</span>'
                }</td>`;
              }
              if (globalFilter.showHomework) {
                const hw = myScores.filter((x) => x.type === "homework");
                h += `<td>${hw.length ? hw.length : '<span class="muted">0</span>'}</td>`;
              }
            } else {
              if (globalFilter.showAttendance) {
                const p = Object.values(sess.attendance).filter(
                  (x) => x === "present",
                ).length;
                const a = Object.values(sess.attendance).filter(
                  (x) => x === "absent",
                ).length;
                const l = Object.values(sess.attendance).filter(
                  (x) => x && x.startsWith("late"),
                ).length;
                h += `<td>✅${p} ❌${a} ⏰${l}</td>`;
              }
              if (globalFilter.showScores) {
                const m = sess.scores.filter(
                  (x) => x.type === "mostamar",
                ).length;
                const pay = sess.scores.filter(
                  (x) => x.type === "payani",
                ).length;
                const classMarks = sess.scores.filter(
                  (score) => score.type === "classGrade",
                ).length;
                h +=
                  "<td>" +
                  (m || pay || classMarks
                    ? "مستمر: " +
                      m +
                      " · پایانی: " +
                      pay +
                      " · کلاسی: " +
                      classMarks
                    : "—") +
                  "</td>";
              }
              if (globalFilter.showPosNeg) {
                const pos = sess.scores.filter(
                  (x) => x.type === "positive",
                ).length;
                const neg = sess.scores.filter(
                  (x) => x.type === "negative",
                ).length;
                h += `<td style="color:#059669;font-weight:600">${pos}</td>`;
                h += `<td style="color:#dc2626;font-weight:600">${neg}</td>`;
              }
              if (globalFilter.showHomework) {
                const hw = sess.scores.filter(
                  (x) => x.type === "homework",
                ).length;
                h += `<td>${hw}</td>`;
              }
            }
            h += `</tr>`;
          });
          h += `</tbody></table></div>`;
        } else {
          h += `<div class="detailed-report-box">`;
          let mainHeader = `📊 <b>گزارش جامع عملکرد کلاسی</b><br>`;
          if (globalFilter.date)
            mainHeader += `📅 تاریخ: ${faDate(globalFilter.date)}<br>`;
          else mainHeader += `📅 تاریخ گزارش: ${faDate(todayISO())}<br>`;
          if (globalFilter.classId) {
            const cls = findClassById(globalFilter.classId);
            mainHeader += `🏫 مدرسه: ${esc(cls.school.name)} | کلاس: ${esc(cls.classObj.name)}<br>`;
          }
          h += `<h2 style="text-align:center">${mainHeader}</h2>`;
          const groupedByPeriod = {};
          filteredSessions.forEach((sess) => {
            if (!groupedByPeriod[sess.period])
              groupedByPeriod[sess.period] = [];
            groupedByPeriod[sess.period].push(sess);
          });
          const sortedPeriods = Object.keys(groupedByPeriod).sort(
            (a, b) => parseInt(a) - parseInt(b),
          );
          sortedPeriods.forEach((periodStr) => {
            const periodNum = parseInt(periodStr);
            h += `<div class="period-block"><div class="period-title">⏰ ${getPeriodName(periodNum)}</div>`;
            groupedByPeriod[periodStr].forEach((sess) => {
              const cls = findClassById(sess.classId);
              const lesson = getLessonObj(cls.classObj, sess.lessonId);
              h += `<div class="session-detail"><b>📚 درس:</b> ${esc(lesson.name)} | <b>👨‍🏫 دبیر:</b> ${esc(lesson.teacher || "---")} | <b>کلاس:</b> ${esc(cls.classObj.name)}<br>`;
              if (globalFilter.showAttendance) {
                const presentNames = [],
                  absentNames = [],
                  lateNames = [];
                sessionStudents(cls.classObj, sess).forEach((st) => {
                  const status = sess.attendance[st.id];
                  if (status === "present") presentNames.push(st.name);
                  else if (status === "absent") absentNames.push(st.name);
                  else if (status && status.startsWith("late")) {
                    const mins = status.includes(":")
                      ? status.split(":")[1]
                      : "";
                    lateNames.push(
                      `${st.name} ${mins ? "(" + mins + "د)" : ""}`,
                    );
                  }
                });
                if (globalFilter.showPresentNames && presentNames.length > 0)
                  h += `<div class="names-list"><b class="present">✅ حاضرین (${presentNames.length}):</b> ${presentNames.map(esc).join("، ")}</div>`;
                else if (presentNames.length > 0)
                  h += `<div class="names-list"><b class="present">✅ حاضر:</b> ${presentNames.length} نفر</div>`;
                if (globalFilter.showAbsentNames && absentNames.length > 0)
                  h += `<div class="names-list"><b class="absent">❌ غایبین (${absentNames.length}):</b> ${absentNames.map(esc).join("، ")}</div>`;
                else if (absentNames.length > 0)
                  h += `<div class="names-list"><b class="absent">❌ غایب:</b> ${absentNames.length} نفر</div>`;
                if (globalFilter.showLateNames && lateNames.length > 0)
                  h += `<div class="names-list"><b class="late">⏰ تأخیری‌ها (${lateNames.length}):</b> ${lateNames.map(esc).join("، ")}</div>`;
                else if (lateNames.length > 0)
                  h += `<div class="names-list"><b class="late">⏰ تأخیر:</b> ${lateNames.length} نفر</div>`;
                if (
                  presentNames.length === 0 &&
                  absentNames.length === 0 &&
                  lateNames.length === 0
                )
                  h += `<div class="names-list muted">وضعیت حضور ثبت نشده است.</div>`;
              }
              if (globalFilter.showScores) {
                const exams = sess.scores.filter(
                  (x) =>
                    x.type === "mostamar" ||
                    x.type === "payani" ||
                    x.type === "classGrade",
                );
                if (exams.length)
                  h +=
                    `<div class="names-list" style="color:#3730a3;margin-top:8px">📊 نمرات: ` +
                    exams
                      .map((x) => {
                        const st = sessionStudent(
                          cls.classObj,
                          sess,
                          x.studentId,
                        );
                        return `${st ? st.name : ""}(${TYPE_LABELS[x.type]}:${x.value})`;
                      })
                      .map(esc)
                      .join("، ") +
                    `</div>`;
              }
              if (globalFilter.showPosNeg) {
                const pos = sess.scores.filter((x) => x.type === "positive");
                const neg = sess.scores.filter((x) => x.type === "negative");
                if (pos.length)
                  h +=
                    `<div class="names-list" style="color:#059669;margin-top:4px">➕ مثبت (${pos.length}): ` +
                    pos
                      .map((x) => {
                        const st = sessionStudent(
                          cls.classObj,
                          sess,
                          x.studentId,
                        );
                        return `${st ? st.name : ""}(${x.value})`;
                      })
                      .map(esc)
                      .join("، ") +
                    `</div>`;
                if (neg.length)
                  h +=
                    `<div class="names-list" style="color:#dc2626;margin-top:4px">➖ منفی (${neg.length}): ` +
                    neg
                      .map((x) => {
                        const st = sessionStudent(
                          cls.classObj,
                          sess,
                          x.studentId,
                        );
                        return `${st ? st.name : ""}(${x.value})`;
                      })
                      .map(esc)
                      .join("، ") +
                    `</div>`;
              }
              if (globalFilter.showHomework) {
                const hw = sess.scores.filter((x) => x.type === "homework");
                if (hw.length)
                  h +=
                    `<div class="names-list" style="color:#3730a3;margin-top:4px">📝 تکالیف (${hw.length}): ` +
                    hw
                      .map((x) => {
                        const st = sessionStudent(
                          cls.classObj,
                          sess,
                          x.studentId,
                        );
                        return `${st ? st.name : ""}${x.note ? "(" + x.note + ")" : ""}`;
                      })
                      .map(esc)
                      .join("، ") +
                    `</div>`;
              }
              h += `</div><hr style="border:0;border-top:1px dashed #e2e8f0;margin:10px 0">`;
            });
            h += `</div>`;
          });
          h += `</div>`;
        }
        h += `</div>`;
        out.innerHTML = h;
      }

      function copyGlobalReportText(btn) {
        const filteredSessions = getFilteredSessions();
        if (filteredSessions.length === 0)
          return alert("موردی برای گزارش یافت نشد.");
        let text = `📊 گزارش جامع عملکرد کلاسی\n`;
        if (globalFilter.date)
          text += `📅 تاریخ گزارش: ${faDate(globalFilter.date)}\n`;
        else text += `📅 تاریخ گزارش: ${faDate(todayISO())}\n`;
        if (globalFilter.classId) {
          const cls = findClassById(globalFilter.classId);
          text += `🏫 مدرسه: ${cls.school.name} | کلاس: ${cls.classObj.name}\n`;
        }
        text += `================================\n\n`;
        if (globalFilter.reportMode === "summary") {
          filteredSessions.forEach((sess) => {
            const cls = findClassById(sess.classId);
            const lesson = getLessonObj(cls.classObj, sess.lessonId);
            text += `📅 ${faDate(sess.date)} | کلاس: ${cls.classObj.name} | درس: ${lesson.name} | ${getPeriodName(sess.period)}\n`;
            if (globalFilter.studentId) {
              const stObj = getStudentObj(cls.classObj, globalFilter.studentId);
              if (globalFilter.showAttendance) {
                const st = sess.attendance[globalFilter.studentId];
                let att = "ثبت نشده";
                if (st === "present") att = "حاضر";
                else if (st === "absent") att = "غایب";
                else if (st && st.startsWith("late"))
                  att = `تأخیر (${st.split(":")[1] || 0}د)`;
                text += `   👤 ${stObj?.name || ""}: ${att}\n`;
              }
              const my = sess.scores.filter(
                (x) => x.studentId === globalFilter.studentId,
              );
              if (globalFilter.showScores) {
                const ms = my
                  .filter((x) => x.type === "mostamar")
                  .map((x) => x.value)
                  .join("، ");
                const ps = my
                  .filter((x) => x.type === "payani")
                  .map((x) => x.value)
                  .join("، ");
                if (my.some((score) => score.type === "classGrade"))
                  text +=
                    "   - نمره کلاسی: " +
                    my
                      .filter((score) => score.type === "classGrade")
                      .map((score) => score.value)
                      .join("، ") +
                    "\n";
                if (ms || ps)
                  text += `   - مستمر: ${ms || "—"} | پایانی: ${ps || "—"}\n`;
              }
              if (globalFilter.showPosNeg) {
                const pos = my.filter((x) => x.type === "positive");
                const neg = my.filter((x) => x.type === "negative");
                text += `   - ➕ مثبت (${pos.length}): ${pos.map((x) => `(${x.value})`).join("، ") || "—"}\n`;
                text += `   - ➖ منفی (${neg.length}): ${neg.map((x) => `(${x.value})`).join("، ") || "—"}\n`;
              }
              if (globalFilter.showHomework) {
                const hw = my.filter((x) => x.type === "homework");
                if (hw.length) text += `   - 📝 تکالیف: ${hw.length}\n`;
              }
            } else {
              if (globalFilter.showAttendance) {
                const p = Object.values(sess.attendance).filter(
                  (x) => x === "present",
                ).length;
                const a = Object.values(sess.attendance).filter(
                  (x) => x === "absent",
                ).length;
                const l = Object.values(sess.attendance).filter(
                  (x) => x && x.startsWith("late"),
                ).length;
                text += `   👥 حضور: حاضر ${p} | غایب ${a} | تأخیر ${l}\n`;
              }
              if (globalFilter.showScores) {
                const m = sess.scores.filter(
                  (x) => x.type === "mostamar",
                ).length;
                const pay = sess.scores.filter(
                  (x) => x.type === "payani",
                ).length;
                const classMarks = sess.scores.filter(
                  (score) => score.type === "classGrade",
                );
                if (classMarks.length)
                  text +=
                    "   - نمرات کلاسی: " +
                    classMarks.map((score) => score.value).join("، ") +
                    "\n";
                if (m || pay)
                  text += `   - 📊 نمرات: مستمر ${m} | پایانی ${pay}\n`;
              }
              if (globalFilter.showPosNeg) {
                const pos = sess.scores.filter(
                  (x) => x.type === "positive",
                ).length;
                const neg = sess.scores.filter(
                  (x) => x.type === "negative",
                ).length;
                text += `   - ➕ مثبت: ${pos} | ➖ منفی: ${neg}\n`;
              }
              if (globalFilter.showHomework) {
                const hw = sess.scores.filter(
                  (x) => x.type === "homework",
                ).length;
                if (hw) text += `   - 📝 تکالیف: ${hw}\n`;
              }
            }
            text += `\n`;
          });
        } else {
          const groupedByPeriod = {};
          filteredSessions.forEach((sess) => {
            if (!groupedByPeriod[sess.period])
              groupedByPeriod[sess.period] = [];
            groupedByPeriod[sess.period].push(sess);
          });
          const sortedPeriods = Object.keys(groupedByPeriod).sort(
            (a, b) => parseInt(a) - parseInt(b),
          );
          sortedPeriods.forEach((periodStr) => {
            text += `📌 ${getPeriodName(parseInt(periodStr))}:\n`;
            groupedByPeriod[periodStr].forEach((sess) => {
              const cls = findClassById(sess.classId);
              const lesson = getLessonObj(cls.classObj, sess.lessonId);
              text += `🔹 درس: ${lesson.name} | دبیر: ${lesson.teacher || "---"} | کلاس: ${cls.classObj.name}\n`;
              if (globalFilter.showAttendance) {
                const presentNames = [],
                  absentNames = [],
                  lateNames = [];
                sessionStudents(cls.classObj, sess).forEach((st) => {
                  const status = sess.attendance[st.id];
                  if (status === "present") presentNames.push(st.name);
                  else if (status === "absent") absentNames.push(st.name);
                  else if (status && status.startsWith("late")) {
                    const mins = status.includes(":")
                      ? status.split(":")[1]
                      : "";
                    lateNames.push(
                      `${st.name} ${mins ? "(" + mins + "د)" : ""}`,
                    );
                  }
                });
                if (presentNames.length > 0) {
                  if (globalFilter.showPresentNames)
                    text += `   ✅ حاضرین (${presentNames.length}): ${presentNames.join("، ")}\n`;
                  else text += `   ✅ حاضرین: ${presentNames.length} نفر\n`;
                }
                if (absentNames.length > 0) {
                  if (globalFilter.showAbsentNames)
                    text += `   ❌ غایبین (${absentNames.length}): ${absentNames.join("، ")}\n`;
                  else text += `   ❌ غایبین: ${absentNames.length} نفر\n`;
                }
                if (lateNames.length > 0) {
                  if (globalFilter.showLateNames)
                    text += `   ⏰ تأخیری‌ها (${lateNames.length}): ${lateNames.join("، ")}\n`;
                  else text += `   ⏰ تأخیری‌ها: ${lateNames.length} نفر\n`;
                }
              }
              if (globalFilter.showScores) {
                const ex = sess.scores.filter(
                  (x) =>
                    x.type === "mostamar" ||
                    x.type === "payani" ||
                    x.type === "classGrade",
                );
                if (ex.length)
                  text +=
                    `   📊 نمرات: ` +
                    ex
                      .map((x) => {
                        const s = sessionStudent(
                          cls.classObj,
                          sess,
                          x.studentId,
                        );
                        return `${s ? s.name : ""}(${TYPE_LABELS[x.type]}:${x.value})`;
                      })
                      .join("، ") +
                    `\n`;
              }
              if (globalFilter.showPosNeg) {
                const pos = sess.scores.filter((x) => x.type === "positive");
                const neg = sess.scores.filter((x) => x.type === "negative");
                if (pos.length)
                  text +=
                    `   ➕ مثبت (${pos.length}): ` +
                    pos
                      .map((x) => {
                        const s = sessionStudent(
                          cls.classObj,
                          sess,
                          x.studentId,
                        );
                        return `${s ? s.name : ""}(${x.value})`;
                      })
                      .join("، ") +
                    `\n`;
                if (neg.length)
                  text +=
                    `   ➖ منفی (${neg.length}): ` +
                    neg
                      .map((x) => {
                        const s = sessionStudent(
                          cls.classObj,
                          sess,
                          x.studentId,
                        );
                        return `${s ? s.name : ""}(${x.value})`;
                      })
                      .join("، ") +
                    `\n`;
              }
              if (globalFilter.showHomework) {
                const hw = sess.scores.filter((x) => x.type === "homework");
                if (hw.length)
                  text +=
                    `   📝 تکالیف (${hw.length}): ` +
                    hw
                      .map((x) => {
                        const s = sessionStudent(
                          cls.classObj,
                          sess,
                          x.studentId,
                        );
                        return `${s ? s.name : ""}`;
                      })
                      .join("، ") +
                    `\n`;
              }
              text += `\n`;
            });
            text += `--------------------------------\n`;
          });
        }
        text += `\n✅ تولید شده توسط سامانه مدیریت مدرسه`;
        copyToClipboard(text, btn);
      }

      // ==================== زیربخش ۲: گزارش درس ====================
      function renderLessonReportTabHtml() {
        const allClasses = [];
        db.schools.forEach((s) =>
          s.classes.forEach((c) => allClasses.push({ school: s, class: c })),
        );
        let h = `<div class="card">
    <h3>📊 گزارش درس</h3>
    <div class="row">
      <select onchange="updateLessonReportFilter('schoolId', this.value)">
        <option value="">همه مدارس</option>
        ${db.schools.map((s) => `<option value="${s.id}" ${lessonReportFilter.schoolId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
      </select>
      <select onchange="updateLessonReportFilter('classId', this.value)">
        <option value="">همه کلاس‌ها</option>
        ${allClasses
          .filter(
            (x) =>
              !lessonReportFilter.schoolId ||
              x.school.id === lessonReportFilter.schoolId,
          )
          .map(
            (x) =>
              `<option value="${x.class.id}" ${lessonReportFilter.classId === x.class.id ? "selected" : ""}>${esc(x.school.name)} / ${esc(x.class.name)}</option>`,
          )
          .join("")}
      </select>
      <select onchange="updateLessonReportFilter('lessonId', this.value)">
        <option value="">همه دروس</option>
        ${allClasses
          .filter(
            (x) =>
              (!lessonReportFilter.schoolId ||
                x.school.id === lessonReportFilter.schoolId) &&
              (!lessonReportFilter.classId ||
                x.class.id === lessonReportFilter.classId),
          )
          .map((x) =>
            (x.class.lessons || [])
              .map(
                (l) =>
                  `<option value="${l.id}" ${lessonReportFilter.lessonId === l.id ? "selected" : ""}>${esc(x.class.name)} - ${esc(l.name)}</option>`,
              )
              .join(""),
          )
          .join("")}
      </select>
    </div>
  </div>
  <div id="lessonReportTabOutput"></div>`;
        return h;
      }
      function updateLessonReportFilter(key, val) {
        lessonReportFilter[key] = val;
        if (key === "schoolId") {
          lessonReportFilter.classId = "";
          lessonReportFilter.lessonId = "";
        }
        if (key === "classId") {
          lessonReportFilter.lessonId = "";
        }
        render();
      }
      function renderLessonReportTab() {
        const out = document.getElementById("lessonReportTabOutput");
        if (!out) return;
        if (!lessonReportFilter.lessonId) {
          out.innerHTML = `<div class="card"><div class="empty">لطفاً یک درس انتخاب کنید.</div></div>`;
          return;
        }
        const cls = findClassById(lessonReportFilter.classId);
        if (!cls) {
          out.innerHTML = `<div class="card"><div class="empty">کلاس یافت نشد.</div></div>`;
          return;
        }
        const lesson = getLessonObj(cls.classObj, lessonReportFilter.lessonId);
        if (!lesson) {
          out.innerHTML = `<div class="card"><div class="empty">درس یافت نشد.</div></div>`;
          return;
        }
        out.innerHTML = buildLessonReportHtml(cls.classObj, lesson);
      }

      function buildLessonReportHtml(c, lesson) {
        const sessions = db.sessions
          .filter((x) => x.classId === c.id && x.lessonId === lesson.id)
          .sort((a, b) => a.date.localeCompare(b.date));
        let h = `<div class="card"><h3>📊 گزارش درس ${esc(lesson.name)}${lesson.teacher ? ` — ${esc(lesson.teacher)}` : ""}</h3>
    <div class="row no-print" style="justify-content:flex-end;margin-bottom:14px">
      <button class="success" onclick="copyLessonReportForVicePrincipal('${lesson.id}')">📋 کپی متن برای معاون</button>
      <button onclick="EduV24.printReport(this)">🖨️ چاپ / PDF</button>
    </div>
    <p class="muted">${sessions.length} جلسه ثبت شده</p>`;
        if (lesson.gradeMode === "kardanesh")
          h += buildKardaneshSummaryHtml(c, lesson);
        if (!sessions.length) h += `<div class="empty">جلسه‌ای ثبت نشده</div>`;
        else
          sessions.forEach((sess) => {
            const present = [],
              absent = [],
              late = [];
            sessionStudents(c, sess).forEach((s) => {
              const st = sess.attendance[s.id];
              if (st === "present") present.push(s.name);
              else if (st === "absent") absent.push(s.name);
              else if (st && st.startsWith("late")) {
                const mins = st.includes(":") ? st.split(":")[1] : "";
                late.push(`${s.name} ${mins ? `(${mins}د)` : ""}`);
              }
            });
            const pos = sess.scores.filter((x) => x.type === "positive");
            const neg = sess.scores.filter((x) => x.type === "negative");
            const hw = sess.scores.filter((x) => x.type === "homework");
            const poudman = lesson.poudmans.find(
              (p) => p.id === sess.poudmanId,
            );
            const unit = poudman
              ? poudman.units.find((u) => u.id === sess.unitId)
              : null;
            h += `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:10px 0">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <strong>${faDate(sess.date)} — زنگ ${sess.period + 1}</strong>
        <span class="muted">${lesson.gradeMode === "kardanesh" ? "کاردانش: تئوری و عملی" : (poudman ? esc(poudman.name) : "—") + " / " + (unit ? esc(unit.name) : "—")}</span>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.9em;margin-bottom:8px">
        <span>✅ حاضر: <b>${present.length}</b></span><span>❌ غایب: <b>${absent.length}</b></span>
        <span>⏰ تأخیر: <b>${late.length}</b></span>
        <span style="color:#059669">➕ مثبت: <b>${pos.length}</b></span>
        <span style="color:#dc2626">➖ منفی: <b>${neg.length}</b></span>
        <span>📝 تکلیف: <b>${hw.length}</b></span>
      </div>
      ${absent.length ? `<div style="font-size:.85em;color:#dc2626">غایبین: ${absent.map(esc).join("، ")}</div>` : ""}
      ${late.length ? `<div style="font-size:.85em;color:#d97706">تأخیر: ${late.map(esc).join("، ")}</div>` : ""}
      ${present.length ? `<div style="font-size:.85em;color:#059669;margin-top:4px">حاضرین: ${present.map(esc).join("، ")}</div>` : ""}
      ${
        pos.length
          ? `<div style="font-size:.85em;color:#059669;margin-top:4px">➕ مثبت: ${pos
              .map((x) => {
                const s = sessionStudent(c, sess, x.studentId);
                return esc(s ? s.name : "") + `(${esc(x.value)})`;
              })
              .join("، ")}</div>`
          : ""
      }
      ${
        neg.length
          ? `<div style="font-size:.85em;color:#dc2626;margin-top:4px">➖ منفی: ${neg
              .map((x) => {
                const s = sessionStudent(c, sess, x.studentId);
                return esc(s ? s.name : "") + `(${esc(x.value)})`;
              })
              .join("، ")}</div>`
          : ""
      }
      ${
        hw.length
          ? `<div style="font-size:.85em;color:#3730a3;margin-top:4px">📝 تکالیف: ${hw
              .map((x) => {
                const s = sessionStudent(c, sess, x.studentId);
                return esc(s ? s.name : "");
              })
              .join("، ")}</div>`
          : ""
      }
    </div>`;
          });
        h += `<h4>خلاصه هر دانش‌آموز</h4>
    <table class="karnameh-table"><thead><tr>
      <th>دانش‌آموز</th><th>حاضر</th><th>غایب</th><th>تأخیر</th>
      <th>➕ مثبت</th><th>➖ منفی</th><th>📝 تکلیف</th><th>مستمر / تئوری</th><th>پایانی / عملی</th><th>نهایی</th>
    </tr></thead><tbody>`;
        const sortedStudents = getSortedStudents(c);
        sortedStudents.forEach((st) => {
          const s = calcStudentLesson(c, lesson, st.id);
          h += `<tr><td>${esc(st.name)}</td>
      <td>${s.att.present}</td><td>${s.att.absent}</td><td>${s.att.late}</td>
      <td style="color:#059669">${s.posCount}</td><td style="color:#dc2626">${s.negCount}</td><td>${s.hwCount}</td>
      <td>${s.avgM !== null ? s.avgM.toFixed(2) : "—"}</td>
      <td>${s.avgP !== null ? s.avgP.toFixed(2) : "—"}</td>
      <td><b>${s.final !== null ? s.final.toFixed(2) : "—"}</b></td></tr>`;
        });
        h += `</tbody></table></div>`;
        return h;
      }

      function copyLessonReportForVicePrincipal(lessonId) {
        const cls = findClassById(lessonReportFilter.classId);
        if (!cls) return;
        const c = cls.classObj;
        const lesson = getLessonObj(c, lessonId);
        if (!c || !lesson) return;
        const sessions = db.sessions
          .filter((x) => x.classId === c.id && x.lessonId === lesson.id)
          .sort((a, b) => a.date.localeCompare(b.date));
        let text = `📊 گزارش درس: ${lesson.name} (کلاس ${c.name})\n👨‍🏫 دبیر: ${lesson.teacher || "---"}\n================================\n\n`;
        if (!sessions.length) text += `هنوز جلسه‌ای ثبت نشده است.\n`;
        sessions.forEach((sess) => {
          text += generateSessionReportText(sess, c, lesson) + `\n`;
        });
        text += `================================\n📌 خلاصه وضعیت دانش‌آموزان:\n`;
        getSortedStudents(c).forEach((st) => {
          const s = calcStudentLesson(c, lesson, st.id);
          text += `- ${st.name}: غایب ${s.att.absent} | ➕ ${s.posCount} | ➖ ${s.negCount} | نهایی: ${s.final !== null ? s.final.toFixed(2) : "---"}\n`;
        });
        text += `\n✅ تولید شده توسط سامانه مدیریت مدرسه`;
        const dummyBtn = document.createElement("button");
        copyToClipboard(text, dummyBtn);
      }

      // ==================== زیربخش ۳: کارنامه ====================
      function renderKarnamehTabHtml() {
        const allClasses = [];
        db.schools.forEach((s) =>
          s.classes.forEach((c) => allClasses.push({ school: s, class: c })),
        );
        let h = `<div class="card">
    <h3>📋 کارنامه</h3>
    <div class="row">
      <select onchange="updateKarnamehFilter('schoolId', this.value)">
        <option value="">انتخاب مدرسه</option>
        ${db.schools.map((s) => `<option value="${s.id}" ${karnamehFilter.schoolId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
      </select>
      <select onchange="updateKarnamehFilter('classId', this.value)">
        <option value="">انتخاب کلاس</option>
        ${allClasses
          .filter(
            (x) =>
              !karnamehFilter.schoolId ||
              x.school.id === karnamehFilter.schoolId,
          )
          .map(
            (x) =>
              `<option value="${x.class.id}" ${karnamehFilter.classId === x.class.id ? "selected" : ""}>${esc(x.school.name)} / ${esc(x.class.name)}</option>`,
          )
          .join("")}
      </select>
      <select onchange="updateKarnamehFilter('studentId', this.value)">
        <option value="">همه دانش‌آموزان (نمای کلی)</option>
        ${allClasses
          .filter(
            (x) =>
              (!karnamehFilter.schoolId ||
                x.school.id === karnamehFilter.schoolId) &&
              (!karnamehFilter.classId ||
                x.class.id === karnamehFilter.classId),
          )
          .map((x) =>
            getSortedStudents({
              students: [
                ...x.class.students,
                ...(x.class.archivedStudents || []),
              ],
            })
              .map(
                (st) =>
                  `<option value="${st.id}" ${karnamehFilter.studentId === st.id ? "selected" : ""}>${esc(st.name)}</option>`,
              )
              .join(""),
          )
          .join("")}
      </select>
    </div>
  </div>
  <div id="karnamehTabOutput"></div>`;
        return h;
      }
      function updateKarnamehFilter(key, val) {
        karnamehFilter[key] = val;
        if (key === "schoolId") {
          karnamehFilter.classId = "";
          karnamehFilter.studentId = "";
        }
        if (key === "classId") {
          karnamehFilter.studentId = "";
        }
        render();
      }
      function renderKarnamehTabReports() {
        const out = document.getElementById("karnamehTabOutput");
        if (!out) return;
        if (!karnamehFilter.classId) {
          out.innerHTML = `<div class="card"><div class="empty">لطفاً یک کلاس انتخاب کنید.</div></div>`;
          return;
        }
        const cls = findClassById(karnamehFilter.classId);
        if (!cls) {
          out.innerHTML = `<div class="card"><div class="empty">کلاس یافت نشد.</div></div>`;
          return;
        }
        const c = cls.classObj;
        if (karnamehFilter.studentId)
          out.innerHTML = buildDetailedKarnamehHtml(
            c,
            karnamehFilter.studentId,
          );
        else out.innerHTML = buildOverviewKarnamehHtml(c);
      }

      function buildOverviewKarnamehHtml(c) {
        const lessons = c.lessons || [];
        let h = `<div class="card"><h3>📋 نمای کلی کارنامه کلاس ${esc(c.name)}</h3>
    <div class="row no-print" style="justify-content:flex-end;margin-bottom:14px">
      <button onclick="EduV24.printReport(this)">🖨️ چاپ / PDF</button>
    </div>`;
        if (!lessons.length) {
          h += `<div class="empty">درسی تعریف نشده</div></div>`;
          return h;
        }
        h += `<div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
    <th>#</th><th>دانش‌آموز</th>`;
        lessons.forEach((l) => {
          h += `<th>${esc(l.name)}</th>`;
        });
        h += `<th style="background:#eef2ff;color:#4338ca">میانگین کل</th></tr></thead><tbody>`;
        const sortedStudents = getSortedStudents(c);
        sortedStudents.forEach((st, i) => {
          let sum = 0,
            count = 0;
          h += `<tr><td>${i + 1}</td><td>${esc(st.name)}</td>`;
          lessons.forEach((l) => {
            const s = calcStudentLesson(c, l, st.id);
            h += `<td>${s.final !== null ? s.final.toFixed(2) : "—"}</td>`;
            if (s.final !== null) {
              sum += s.final;
              count++;
            }
          });
          const avg = count > 0 ? (sum / count).toFixed(2) : "—";
          h += `<td style="background:#eef2ff;font-weight:700;color:#4338ca">${avg}</td></tr>`;
        });
        h += `</tbody></table></div></div>`;
        return h;
      }

      function buildDetailedKarnamehHtml(c, stId) {
        const student = getStudentObj(c, stId);
        if (!student)
          return `<div class="card"><div class="empty">دانش‌آموز یافت نشد</div></div>`;
        const lessons = c.lessons || [];
        let h = `<div class="card"><h3>📋 کارنامه تفصیلی — ${esc(student.name)}</h3>
    <div class="row no-print" style="justify-content:flex-end;margin-bottom:14px">
      <button onclick="EduV24.printReport(this)">🖨️ چاپ / PDF</button>
    </div>`;
        if (!lessons.length) {
          h += `<div class="empty">درسی تعریف نشده</div></div>`;
          return h;
        }

        h += `<h4>خلاصه کلی دروس</h4>
    <div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
      <th>درس</th><th>دبیر</th><th>مستمر / تئوری</th><th>پایانی / عملی</th><th>نهایی</th>
      <th>➕</th><th>➖</th><th>📝</th><th>حاضر</th><th>غایب</th><th>میانگین کل</th>
    </tr></thead><tbody>`;
        const stats = {};
        let sumFinal = 0,
          countFinal = 0;
        lessons.forEach((l) => {
          stats[l.id] = calcStudentLesson(c, l, stId);
          const s = stats[l.id];
          if (s.final !== null) {
            sumFinal += s.final;
            countFinal++;
          }
          h += `<tr><td>${esc(l.name)}</td><td>${esc(l.teacher || "—")}</td>
      <td>${s.avgM !== null ? s.avgM.toFixed(2) : "—"}</td>
      <td>${s.avgP !== null ? s.avgP.toFixed(2) : "—"}</td>
      <td><b>${s.final !== null ? s.final.toFixed(2) : "—"}</b></td>
      <td style="color:#059669">${s.posCount}</td><td style="color:#dc2626">${s.negCount}</td><td>${s.hwCount}</td>
      <td>${s.att.present}</td><td>${s.att.absent}</td>
      <td style="background:#eef2ff;font-weight:700;color:#4338ca">${s.final !== null ? s.final.toFixed(2) : "—"}</td></tr>`;
        });
        const overallAvg =
          countFinal > 0 ? (sumFinal / countFinal).toFixed(2) : "—";
        h += `</tbody></table></div>`;
        h += `<p style="text-align:left;font-size:1em;margin-top:8px;background:#eef2ff;padding:10px;border-radius:8px">
    <b style="color:#4338ca">📊 میانگین کل نمرات این دانش‌آموز: ${overallAvg}</b></p>`;

        lessons.forEach((l) => {
          const s = stats[l.id];
          if (l.gradeMode === "kardanesh") {
            h += buildKardaneshSummaryHtml(c, l, stId);
            return;
          }
          h += `<h4 style="margin-top:24px">📚 ${esc(l.name)}</h4>
      <p class="muted" style="font-size:.85em">نمره واحد = میانگین وزنی مستمر و پایانی به همراه امتیازات انتخاب‌شده. نهایی درس نیازمند تکمیل همه واحدهاست.</p>
      <div class="filter-units-box no-print">
        <div style="font-weight:700;color:#3730a3;font-size:.9em">⚙️ اعمال در نمره هر واحد (با کلیک روی هر واحد به‌صورت خودکار ذخیره می‌شود):</div>
        <div class="chips">
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','pos',this.checked)"> ➕ مثبت‌ها</label>
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','neg',this.checked)"> ➖ منفی‌ها</label>
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','hw',this.checked)"> 📝 تکالیف</label>
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','present',this.checked)"> ✅ حضور</label>
          <label><input type="checkbox" onchange="toggleAllApplyForLesson('${l.id}','late',this.checked)"> ⏰ تأخیر</label>
        </div>
      </div>
      <div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
        <th>پودمان</th><th>واحد</th><th>مستمر / تئوری</th><th>پایانی / عملی</th>
        <th>➕</th><th>➖</th><th>📝</th><th>حاضر</th><th>غایب</th>
        <th>⚙️ اعمال</th><th>نمره واحد</th>
      </tr></thead><tbody>`;
          l.poudmans.forEach((p) => {
            p.units.forEach((u, ui) => {
              const d = s.details[p.id]?.[u.id] || {
                m: null,
                p: null,
                pos: 0,
                neg: 0,
                hw: 0,
                att: { present: 0, absent: 0, late: 0 },
                final: null,
              };
              const ao = u.applyOptions || {};
              h += `<tr>`;
              if (ui === 0)
                h += `<td rowspan="${p.units.length}">${esc(p.name)}</td>`;
              h += `<td>${esc(u.name)}</td>
          <td>${d.m !== null ? d.m : "—"}</td><td>${d.p !== null ? d.p : "—"}</td>
          <td style="color:#059669">${d.pos || 0}</td><td style="color:#dc2626">${d.neg || 0}</td><td>${d.hw || 0}</td>
          <td>${d.att ? d.att.present : 0}</td><td>${d.att ? d.att.absent : 0}</td>
          <td class="no-print"><div style="display:flex;gap:4px;flex-wrap:wrap">
            <label title="مثبت" style="cursor:pointer"><input type="checkbox" ${ao.pos ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','pos',this.checked)"></label>
            <label title="منفی" style="cursor:pointer"><input type="checkbox" ${ao.neg ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','neg',this.checked)"></label>
            <label title="تکلیف" style="cursor:pointer"><input type="checkbox" ${ao.hw ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','hw',this.checked)"></label>
            <label title="حضور" style="cursor:pointer"><input type="checkbox" ${ao.present ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','present',this.checked)"></label>
            <label title="تأخیر" style="cursor:pointer"><input type="checkbox" ${ao.late ? "checked" : ""} onchange="toggleUnitApply('${l.id}','${p.id}','${u.id}','late',this.checked)"></label>
          </div></td>
          <td style="background:#f0fdf4;font-weight:600;color:#166534">${d.final !== null ? d.final.toFixed(2) : "—"}</td></tr>`;
            });
          });
          h += `</tbody></table></div>
      <p style="text-align:left;font-size:.9em;background:#fef3c7;padding:8px;border-radius:8px;margin-top:6px">
        <b>📊 نمره نهایی این درس: ${s.final !== null ? s.final.toFixed(2) : "—"}</b>
        <span class="muted" style="font-size:.85em"> (میانگین نمرات نهایی واحدها)</span>
      </p>`;
        });
        h += `</div>`;
        return h;
      }

      async function toggleAllApplyForLesson(lessonId, key, checked) {
        const c = findClassById(karnamehFilter.classId);
        if (!c) return;
        const lesson = getLessonObj(c.classObj, lessonId);
        if (!lesson) return;
        lesson.poudmans.forEach((p) =>
          p.units.forEach((u) => {
            if (!u.applyOptions) u.applyOptions = {};
            u.applyOptions[key] = checked;
          }),
        );
        await saveDB({ classId: c.classObj.id });
        renderKarnamehTabReports();
      }

      function generateParentReportText(student, c) {
        let text = `📋 گزارش وضعیت دانش‌آموز\n👤 نام: ${student.name} | کلاس: ${c.name}\n`;
        text += `📅 تاریخ گزارش: ${faDate(todayISO())}\n================================\n\n`;
        let hasData = false;
        (c.lessons || []).forEach((lesson) => {
          const stats = calcStudentLesson(c, lesson, student.id);
          if (
            stats.att.present + stats.att.absent + stats.att.late > 0 ||
            stats.posCount + stats.negCount > 0 ||
            stats.final !== null
          ) {
            hasData = true;
            text += `📚 درس: ${lesson.name} (دبیر: ${lesson.teacher || "---"})\n`;
            text += `- حضور: حاضر ${stats.att.present} | غایب ${stats.att.absent} | تأخیر ${stats.att.late}\n`;
            text += `- امتیازات: ➕ ${stats.posCount} | ➖ ${stats.negCount} | 📝 ${stats.hwCount}\n`;
            text += `- نمرات: ${lesson.gradeMode === "kardanesh" ? "تئوری" : "مستمر"} ${stats.avgM !== null ? stats.avgM.toFixed(2) : "---"} | ${lesson.gradeMode === "kardanesh" ? "عملی" : "پایانی"} ${stats.avgP !== null ? stats.avgP.toFixed(2) : "---"}\n`;
            text += `- نمره نهایی: ${stats.final !== null ? stats.final.toFixed(2) : "---"}${lesson.gradeMode === "kardanesh" ? " | " + gradeStatus(stats) : ""}\n--------------------------------\n`;
          }
        });
        if (!hasData)
          text += `هنوز هیچ اطلاعاتی برای این دانش‌آموز ثبت نشده است.\n`;
        text += `\n✅ تولید شده توسط سامانه مدیریت مدرسه`;
        return text;
      }

      // ==================== ثبت گروهی نمرات ====================
      function openBulkScoreModal(lessonId) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lessonId);
        if (!c || !lesson) return;
        if (lesson.gradeMode === "kardanesh") {
          showModal(
            "ثبت نمرات کاردانش — " + lesson.name,
            buildKardaneshGradesHtml(c, lesson),
          );
          return;
        }
        let h = `<p class="muted">در این بخش می‌توانید نمرات مستمر و پایانی را برای همه دانش‌آموزان به یکباره ثبت کنید. هر پودمان/واحد جداگانه ذخیره می‌شود.</p>`;
        lesson.poudmans.forEach((p) => {
          p.units.forEach((u) => {
            const ao = u.applyOptions || {};
            h += `<div class="unit-block">
        <div class="unit-title">
          <span>📚 ${esc(p.name)} — ${esc(u.name)}</span>
        </div>
        <div class="unit-options">
          <span style="font-weight:600;color:#475569">اعمال در نمره نهایی این واحد:</span>
          <label><input type="checkbox" ${ao.pos ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','pos',this.checked)"> ➕ مثبت</label>
          <label><input type="checkbox" ${ao.neg ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','neg',this.checked)"> ➖ منفی</label>
          <label><input type="checkbox" ${ao.hw ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','hw',this.checked)"> 📝 تکلیف</label>
          <label><input type="checkbox" ${ao.present ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','present',this.checked)"> ✅ حضور</label>
          <label><input type="checkbox" ${ao.late ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','late',this.checked)"> ⏰ تأخیر</label>
        </div>
        <table class="bulk-score-table"><thead><tr>
          <th>#</th><th>دانش‌آموز</th><th>مستمر (0-20)</th><th>پایانی (0-20)</th>
        </tr></thead><tbody>`;
            const sortedStudents = getSortedStudents(c);
            sortedStudents.forEach((st, i) => {
              const existing = ownScoreRecord(u.unitScores, st.id) || {};
              h += `<tr>
          <td>${i + 1}</td>
          <td>${esc(st.name)}</td>
          <td><input type="number" step="0.25" min="0" max="20" value="${existing.m ?? ""}"
               onchange="saveBulkScore('${lesson.id}','${p.id}','${u.id}','${st.id}','m',this.value)"></td>
          <td><input type="number" step="0.25" min="0" max="20" value="${existing.p ?? ""}"
               onchange="saveBulkScore('${lesson.id}','${p.id}','${u.id}','${st.id}','p',this.value)"></td>
        </tr>`;
            });
            h += `</tbody></table></div>`;
          });
        });
        h += `<div class="row" style="justify-content:flex-end;margin-top:14px">
    <button onclick="closeModal()">بستن</button>
  </div>`;
        showModal(`📝 ثبت گروهی نمرات — ${lesson.name}`, h);
      }

      function saveBulkScore(lessonId, pId, uId, stId, field, value) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lessonId);
        if (!lesson) return;
        const p = lesson.poudmans.find((x) => x.id === pId);
        const u = p?.units.find((x) => x.id === uId);
        if (!u) return;
        if (!u.unitScores) u.unitScores = {};
        u.unitScores[stId] = writableScoreRecord(u.unitScores, stId);
        const v = value === "" ? null : parseFloat(value);
        if (v === null || isNaN(v)) delete u.unitScores[stId][field];
        else {
          if (!Number.isFinite(v) || v < 0 || v > 20) {
            alert("نمره باید صفر تا بیست باشد.");
            return;
          }
          u.unitScores[stId][field] = v;
        }
        saveDB();
      }

      async function toggleUnitApplyDirect(lessonId, pId, uId, key, checked) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lessonId);
        if (!lesson) return;
        const p = lesson.poudmans.find((x) => x.id === pId);
        const u = p?.units.find((x) => x.id === uId);
        if (!u) return;
        if (!u.applyOptions) u.applyOptions = {};
        u.applyOptions[key] = checked;
        await saveDB({ classId: c.id });

        const area = document.getElementById("lessonGradesArea");
        if (area && state.view === "lesson" && state.lessonId === lessonId) {
          const c2 = getClassObj(state.schoolId, state.classId);
          const l2 = getLessonObj(c2, lessonId);
          if (c2 && l2) area.innerHTML = buildLessonGradesHtml(c2, l2);
        }
      }

      async function toggleUnitApply(lessonId, pId, uId, key, checked) {
        const c = findClassById(karnamehFilter.classId);
        if (!c) return;
        const lesson = getLessonObj(c.classObj, lessonId);
        if (!lesson) return;
        const p = lesson.poudmans.find((x) => x.id === pId);
        const u = p?.units.find((x) => x.id === uId);
        if (!u) return;
        if (!u.applyOptions) u.applyOptions = {};
        u.applyOptions[key] = checked;
        await saveDB({ classId: c.classObj.id });
        renderKarnamehTabReports();
      }

      // ==================== محاسبه نمرات اصلاح‌شده ====================
      function calcStudentLessonBase(c, lesson, stId, source = db) {
        const sess = source.sessions
          .filter((x) => x.classId === c.id && x.lessonId === lesson.id)
          .sort(
            (a, b) =>
              b.date.localeCompare(a.date) ||
              b.period - a.period ||
              b.id.localeCompare(a.id),
          );
        const details = {};
        lesson.poudmans.forEach((p) => {
          details[p.id] = {};
          p.units.forEach((u) => {
            details[p.id][u.id] = {
              m: null,
              p: null,
              pos: 0,
              posSum: 0,
              neg: 0,
              negSum: 0,
              hw: 0,
              att: { present: 0, absent: 0, late: 0 },
              final: null,
            };
          });
        });

        let posCount = 0,
          negCount = 0,
          hwCount = 0;
        const att = { present: 0, absent: 0, late: 0 };

        sess.forEach((s) => {
          const myAtt = s.attendance[stId];
          if (myAtt) {
            if (myAtt.startsWith("late")) {
              att.late++;
              if (s.poudmanId && s.unitId && details[s.poudmanId]?.[s.unitId]) {
                details[s.poudmanId][s.unitId].att.late++;
              }
            } else if (myAtt === "present") {
              att.present++;
              if (s.poudmanId && s.unitId && details[s.poudmanId]?.[s.unitId])
                details[s.poudmanId][s.unitId].att.present++;
            } else if (myAtt === "absent") {
              att.absent++;
              if (s.poudmanId && s.unitId && details[s.poudmanId]?.[s.unitId])
                details[s.poudmanId][s.unitId].att.absent++;
            }
          }

          [...s.scores]
            .reverse()
            .filter((x) => x.studentId === stId)
            .forEach((sc) => {
              const d =
                (s.poudmanId && s.unitId && details[s.poudmanId]?.[s.unitId]) ||
                null;
              if (sc.type === "positive") {
                posCount++;
                if (d) {
                  d.pos++;
                  d.posSum += Number(sc.value);
                }
              } else if (sc.type === "negative") {
                negCount++;
                if (d) {
                  d.neg++;
                  d.negSum += Number(sc.value);
                }
              } else if (sc.type === "homework") {
                hwCount++;
                if (d) d.hw++;
              } else if (sc.type === "mostamar" && d && d.m === null) {
                d.m = sc.value;
              } else if (sc.type === "payani" && d && d.p === null) {
                d.p = sc.value;
              }
            });
        });

        lesson.poudmans.forEach((p) => {
          p.units.forEach((u) => {
            const us = ownScoreRecord(u.unitScores, stId);
            if (us) {
              if (us.m !== undefined && us.m !== null)
                details[p.id][u.id].m = us.m;
              if (us.p !== undefined && us.p !== null)
                details[p.id][u.id].p = us.p;
            }
          });
        });

        const allM = [],
          allP = [];
        lesson.poudmans.forEach((p) => {
          p.units.forEach((u) => {
            const d = details[p.id][u.id];
            let unitFinal = null;

            const wm = lesson.weightMostamar ?? 40,
              wp = lesson.weightPayani ?? 60;
            if ((wm === 0 || d.m !== null) && (wp === 0 || d.p !== null))
              unitFinal = ((d.m ?? 0) * wm + (d.p ?? 0) * wp) / 100;

            if (unitFinal !== null) {
              let adj = 0;
              const ao = u.applyOptions || {};
              if (ao.pos) adj += d.posSum;
              if (ao.neg) adj -= d.negSum;
              if (ao.hw) adj += d.hw * 1;
              if (ao.present) adj += d.att.present * 1;
              if (ao.late) adj -= d.att.late * 1;

              unitFinal = unitFinal + adj;
              unitFinal = Math.max(0, Math.min(20, unitFinal));
            }
            d.final = unitFinal;
            if (d.m !== null) allM.push(d.m);
            if (d.p !== null) allP.push(d.p);
          });
        });

        const avgM = allM.length
          ? allM.reduce((a, b) => a + b, 0) / allM.length
          : null;
        const avgP = allP.length
          ? allP.reduce((a, b) => a + b, 0) / allP.length
          : null;

        const unitFinals = [];
        lesson.poudmans.forEach((p) =>
          p.units.forEach((u) => {
            if (details[p.id][u.id].final !== null)
              unitFinals.push(details[p.id][u.id].final);
          }),
        );
        const count = lesson.poudmans.reduce((n, p) => n + p.units.length, 0);
        const final =
          count > 0 && unitFinals.length === count
            ? unitFinals.reduce((a, b) => a + b, 0) / count
            : null;

        return { details, posCount, negCount, hwCount, att, avgM, avgP, final };
      }

      // ==================== تنظیمات، پشتیبان، بقیه ====================
      // The persistence layer installs the settings editor and its save command.

      function openReportScope(schoolId = "", classId = "", tab = "daily") {
        window.EduPeriodicReports?.selectScope(schoolId, classId);
        globalFilter = {
          ...globalFilter,
          date: "",
          schoolId,
          classId,
          lessonId: "",
          studentId: "",
          period: "",
        };
        lessonReportFilter = { schoolId, classId, lessonId: "" };
        karnamehFilter = { schoolId, classId, studentId: "" };
        state.view = "reports";
        state.reportTab = tab;
        render();
      }
      function filterDashboardEntities(input) {
        const root = input.closest(".dashboard-directory"),
          q = input.value.replace(/ي/g, "ی").replace(/ك/g, "ک").trim();
        let count = 0;
        for (const item of root.querySelectorAll(".dashboard-entity")) {
          item.hidden = !item.dataset.name
            .replace(/ي/g, "ی")
            .replace(/ك/g, "ک")
            .includes(q);
          if (!item.hidden) count++;
        }
        const message = root.querySelector(".dashboard-search-result");
        message.hidden = !q;
        message.textContent = count
          ? count.toLocaleString("fa-IR") + " مورد پیدا شد"
          : "موردی با این نام پیدا نشد.";
      }

      function dashboardStats(classes, schoolCount) {
        const values = [
          schoolCount,
          classes.length,
          classes.reduce((n, c) => n + c.students.length, 0),
        ];
        const labels = ["مدرسه", "کلاس", "هنرجو"];
        const icons = [
          "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 9h1M15 9h1M8 12h1M15 12h1",
          "M3 4h18v12H3zM8 21h8M12 16v5M7 8h10M7 12h5",
          "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M5 21v-3a7 7 0 0 1 14 0v3M18 4a3 3 0 0 1 0 6M21 20v-3a5 5 0 0 0-2-4",
        ];
        return (
          '<section class="ui-stats dashboard-metrics" aria-label="نمای کلی">' +
          values
            .map(
              (n, i) =>
                '<div class="ui-stat metric-' +
                ["school", "class", "student"][i] +
                '"><span class="metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' +
                icons[i] +
                '"/></svg></span><strong>' +
                n.toLocaleString("fa-IR") +
                '</strong><span class="metric-label">' +
                labels[i] +
                "</span></div>",
            )
            .join("") +
          "</section>"
        );
      }

      function workflowIcon(name) {
        const paths = {
          school:
            "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 9h1M15 9h1M8 12h1M15 12h1",
          classroom: "M3 4h18v13H3zM8 21h8M12 17v4M7 8h10M7 12h6",
          report: "M4 3v18h17M8 17v-5M13 17V8M18 17V5",
        };
        return (
          '<svg class="workflow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' +
          paths[name] +
          '"/></svg>'
        );
      }
      function dashboardDirectory(items, kind, schoolId = "") {
        const isSchool = kind === "schools",
          name = isSchool ? "مدرسه‌ها" : "کلاس‌ها";
        let h =
          '<section class="card dashboard-directory"><header class="dashboard-section-heading"><div><h3>' +
          name +
          ' <span class="lesson-count">' +
          items.length.toLocaleString("fa-IR") +
          "</span></h3><p>مدیریت اطلاعات و دسترسی مستقیم به گزارش‌ها</p></div></header>";
        if (items.length >= 4)
          h +=
            '<label class="dashboard-search no-print"><span>جست‌وجو در ' +
            name +
            '</span><input type="search" placeholder="نام ' +
            (isSchool ? "مدرسه" : "کلاس") +
            '…" oninput="filterDashboardEntities(this)"></label>';
        h +=
          '<p class="dashboard-search-result no-print" role="status" hidden></p><div class="dashboard-entities">';
        if (!items.length)
          h +=
            '<div class="empty"><strong>هنوز ' +
            (isSchool ? "مدرسه‌ای" : "کلاسی") +
            " اضافه نشده</strong><p>از فرم افزودن، اولین " +
            (isSchool ? "مدرسه" : "کلاس") +
            " را تعریف کنید.</p></div>";
        for (const item of items) {
          const id = esc(item.id),
            classes = isSchool ? item.classes : [item],
            students = classes.reduce((n, c) => n + c.students.length, 0);
          const meta = isSchool
            ? classes.length.toLocaleString("fa-IR") +
              " کلاس · " +
              students.toLocaleString("fa-IR") +
              " هنرجو"
            : students.toLocaleString("fa-IR") +
              " هنرجو · " +
              (item.lessons || []).length.toLocaleString("fa-IR") +
              " درس";
          h +=
            '<article class="dashboard-entity" data-name="' +
            esc(item.name) +
            '"><div class="dashboard-entity-info"><span class="dashboard-entity-symbol" aria-hidden="true">' +
            workflowIcon(isSchool ? "school" : "classroom") +
            "</span><div><h4>" +
            esc(item.name) +
            "</h4><p>" +
            meta +
            '</p></div></div><div class="dashboard-entity-actions no-print"><button onclick="' +
            (isSchool ? "goSchool" : "goClass") +
            "('" +
            id +
            "')\">" +
            (isSchool ? "ورود به مدرسه" : "مدیریت کلاس") +
            ' ←</button><button class="ghost" onclick="openReportScope(\'' +
            (isSchool ? id : esc(schoolId)) +
            "','" +
            (isSchool ? "" : id) +
            "','" +
            (isSchool ? "comprehensive" : "karnameh") +
            "')\">" +
            workflowIcon("report") +
            (isSchool ? "گزارش مدرسه" : "کارنامه کلاس") +
            '</button><details class="dashboard-entity-more"><summary id="entity-menu-' +
            (isSchool ? "school" : "class") +
            "-" +
            id +
            '" aria-label="عملیات بیشتر برای ' +
            esc(item.name) +
            '">بیشتر</summary><div><button class="ghost" data-mutating="1" onclick="EduV24.openEntityEditor(\'' +
            (isSchool ? "school" : "class") +
            "\',\'" +
            id +
            "\',\'" +
            (isSchool ? "" : esc(schoolId)) +
            '\')">ویرایش مشخصات</button><button class="danger" onclick="' +
            (isSchool ? "deleteSchool" : "deleteClass") +
            "('" +
            id +
            "')\">حذف " +
            (isSchool ? "مدرسه" : "کلاس") +
            "</button></div></details></div></article>";
        }
        return h + "</div></section>";
      }

      // Dashboard data stays separate from its markup and never mutates grades.
      let dashboardWorkCache = null;
      function dashboardWorkModel(date = todayISO()) {
        const scope = globalThis.EduV24?.getReportContext();
        const cacheKey = scope ? JSON.stringify([date, scope]) : null;
        if (cacheKey && dashboardWorkCache?.key === cacheKey)
          return dashboardWorkCache.model;
        const todaySessions = db.sessions.filter(
          (session) => session.date === date,
        );
        const classes = new Map(
          db.schools.flatMap((school) =>
            school.classes.map((c) => [c.id, { school, c }]),
          ),
        );
        const attendance = [];
        for (const session of todaySessions) {
          const c = classes.get(session.classId)?.c;
          if (!c) continue;
          const members = session.roster || c.students;
          const unknown = members.filter(
            (student) =>
              !/^(present|absent|late(?::\d+)?)$/.test(
                session.attendance?.[student.id] || "",
              ),
          ).length;
          if (unknown) attendance.push({ session, unknown, className: c.name });
        }
        const grading = {
          incomplete: 0,
          remedial: 0,
          unconfirmed: 0,
          errors: 0,
          firstIncompleteClassId: "",
          firstRemedialClassId: "",
        };
        for (const { c } of classes.values())
          for (const lesson of c.lessons || []) {
            if (!lesson.gradingPolicy?.confirmed) grading.unconfirmed++;
            for (const student of c.students) {
              try {
                const result = calcStudentLesson(c, lesson, student.id);
                if (result.passed === false) {
                  grading.remedial++;
                  grading.firstRemedialClassId ||= c.id;
                } else if (result.complete === false || result.final == null) {
                  grading.incomplete++;
                  grading.firstIncompleteClassId ||= c.id;
                }
              } catch {
                grading.errors++;
              }
            }
          }
        const planned = [],
          day = getDayIdxFromDate(date);
        if ((db.activeDays || []).includes(day))
          for (let period = 0; period < (db.periods || 6); period++) {
            const entry = getMasterEntry(day, period, date);
            if (!entry) continue;
            const found = classes.get(entry.classId);
            const lesson = found?.c.lessons.find(
              (l) => l.id === entry.lessonId,
            );
            if (!found || !lesson) continue;
            planned.push({
              period,
              day,
              className: found.c.name,
              schoolName: found.school.name,
              lessonName: lesson.name,
              session:
                todaySessions.find(
                  (s) =>
                    s.classId === entry.classId &&
                    s.lessonId === entry.lessonId &&
                    s.period === period,
                ) || null,
            });
          }
        const model = {
          date,
          attendance,
          grading,
          planned,
          sessions: todaySessions.length,
          closed: !!scope?.closed,
        };
        if (cacheKey) dashboardWorkCache = { key: cacheKey, model };
        return model;
      }
      function dashboardEnsureToday(date) {
        if (date === todayISO()) return true;
        dashboardWorkCache = null;
        render();
        alert(
          "تاریخ روز تغییر کرده است؛ میز کار به‌روز شد. جلسه امروز را دوباره انتخاب کنید.",
        );
        return false;
      }
      function dashboardStartSession(day, period, date) {
        if (dashboardEnsureToday(date)) clickMasterCell(day, period);
      }
      function dashboardOpenSession(id) {
        const session = db.sessions.find((s) => s.id === id);
        if (session && dashboardEnsureToday(session.date))
          openSessionModal(session);
      }
      function dashboardReviewGrades(classId) {
        const found = findClassById(classId);
        if (!found) return;
        state.schoolId = found.school.id;
        goClass(classId);
      }
      function dashboardDailyReport() {
        openReportScope("", "", "daily");
        EduPeriodicReports.set("date", todayISO());
      }
      function renderDashboardWork() {
        if (!db.schools.some((school) => school.classes.length)) return "";
        const model = dashboardWorkModel(),
          fa = (n) => n.toLocaleString("fa-IR");
        const pendingPeople = model.attendance.reduce(
          (n, item) => n + item.unknown,
          0,
        );
        let html =
          '<section class="dashboard-work no-print" aria-labelledby="dashboardWorkTitle">' +
          '<header class="dashboard-work-heading"><div><p class="eyebrow">میز کار روزانه</p><h2 id="dashboardWorkTitle">امروز چه کاری داریم؟</h2><p>' +
          esc(faDate(model.date)) +
          " · " +
          fa(model.sessions) +
          " جلسه ثبت‌شده</p></div>" +
          '<button class="ghost" onclick="dashboardDailyReport()">گزارش روزانه</button></header>';
        html += '<div class="dashboard-tasks">';
        const tasks = [
          {
            count: pendingPeople,
            label: "حضور‌وغیاب تعیین‌نشده",
            detail: "نفرـجلسه در جلسات امروز",
            tone: "amber",
            action: model.attendance.length
              ? "dashboardOpenSession('" +
                esc(model.attendance[0].session.id) +
                "')"
              : "",
            button: "تکمیل حضور‌وغیاب",
          },
          {
            count: model.grading.incomplete,
            label: "نمره ناتمام",
            detail: "هنرجوـدرس در دوره جاری",
            tone: "indigo",
            action: model.grading.firstIncompleteClassId
              ? "dashboardReviewGrades('" +
                esc(model.grading.firstIncompleteClassId) +
                "')"
              : "",
            button: "بررسی دروس",
          },
          {
            count: model.grading.remedial,
            label: "نیازمند جبران",
            detail: "هنرجوـدرس؛ جدا از نمره ناقص",
            tone: "rose",
            action: model.grading.firstRemedialClassId
              ? "dashboardReviewGrades('" +
                esc(model.grading.firstRemedialClassId) +
                "')"
              : "",
            button: "بررسی نتیجه‌ها",
          },
        ];
        for (const task of tasks)
          html +=
            '<article class="dashboard-task task-' +
            task.tone +
            '"><strong>' +
            fa(task.count) +
            "</strong><h3>" +
            task.label +
            "</h3><p>" +
            task.detail +
            "</p>" +
            (task.count && task.action
              ? '<button class="ghost" onclick="' +
                task.action +
                '">' +
                task.button +
                "</button>"
              : '<span class="dashboard-task-clear">موردی برای پیگیری نیست</span>') +
            "</article>";
        html += "</div>";
        if (model.grading.unconfirmed || model.grading.errors)
          html +=
            '<p class="dashboard-work-notice" role="status">' +
            (model.grading.unconfirmed
              ? fa(model.grading.unconfirmed) +
                " درس با قواعد تأییدنشده یا قدیمی؛ پیش از ارائه کارنامه، تنظیمات درس را بررسی کنید. "
              : "") +
            (model.grading.errors
              ? fa(model.grading.errors) +
                " نتیجه قابل محاسبه نیست و نیاز به بررسی دارد."
              : "") +
            "</p>";
        html +=
          '<section class="dashboard-agenda" aria-labelledby="dashboardAgendaTitle"><h3 id="dashboardAgendaTitle">برنامه امروز</h3>';
        if (!model.planned.length)
          html +=
            '<p class="muted">برای امروز زنگی در برنامه هفتگی تعریف نشده است. نبود جلسه به معنی غیبت هنرجو نیست.</p><button class="ghost" onclick="goMaster()">مشاهده برنامه هفتگی</button>';
        else
          for (const item of model.planned)
            html +=
              '<article class="dashboard-agenda-row"><span class="dashboard-period">' +
              esc(getPeriodName(item.period)) +
              "</span><div><h4>" +
              esc(item.lessonName) +
              "</h4><p>" +
              esc(item.schoolName + " · " + item.className) +
              '</p></div><button class="' +
              (item.session ? "ghost" : "") +
              '" onclick="' +
              (item.session
                ? "dashboardOpenSession('" + esc(item.session.id) + "')"
                : "dashboardStartSession(" +
                  item.day +
                  "," +
                  item.period +
                  ",\'" +
                  model.date +
                  "\')") +
              '"' +
              (model.closed && !item.session ? " disabled" : "") +
              ">" +
              (item.session
                ? "مشاهده جلسه"
                : model.closed
                  ? "دوره بسته است"
                  : "ثبت جلسه") +
              "</button></article>";
        return html + "</section></section>";
      }

      function renderSchools() {
        let h =
          headerHtml() +
          '<section class="workflow-welcome no-print"><h2>مدرسه‌های من</h2><p>مدرسه را انتخاب کنید؛ سپس دانش‌آموزان و درس‌های کلاس را آماده کنید.</p><button onclick="goMaster()">برنامه هفتگی من</button></section>';
        h += dashboardDirectory(db.schools, "schools");
        h +=
          '<div class="card"><h3>افزودن مدرسه</h3><form onsubmit="addSchool(event)" data-entity-create="school" class="row"><input id="schoolCreateName" name="name" placeholder="نام مدرسه" aria-label="نام مدرسه جدید" aria-describedby="schoolCreateError" required maxlength="500" style="flex:1"><button type="submit" data-mutating="1">افزودن مدرسه</button><p id="schoolCreateError" class="entity-create-error" role="alert"></p></form></div>';
        return h;
      }
      function renderSchool() {
        const school = getSchool(state.schoolId);
        if (!school) {
          state.view = "schools";
          return renderSchools();
        }
        let h =
          headerHtml() +
          '<div class="breadcrumb"><a onclick="goSchools()">مدارس</a> ← ' +
          esc(school.name) +
          "</div>";
        const count = school.classes.reduce((n, c) => n + c.students.length, 0);
        h +=
          '<section class="school-overview no-print"><div><span>' +
          school.classes.length.toLocaleString("fa-IR") +
          " کلاس</span><span>" +
          count.toLocaleString("fa-IR") +
          " هنرجو</span></div><button onclick=\"openReportScope('" +
          esc(school.id) +
          "')\">گزارش این مدرسه ←</button></section>";
        h +=
          '<div class="entity-context-edit no-print"><button class="ghost" data-mutating="1" onclick="EduV24.openEntityEditor(\'school\',\'' +
          esc(school.id) +
          "')\">ویرایش مشخصات مدرسه</button></div>";
        h += dashboardDirectory(school.classes, "classes", school.id);
        h +=
          '<div class="card"><h3>افزودن کلاس</h3><form onsubmit="addClass(event)" data-entity-create="class" class="row"><input id="classCreateName" name="name" placeholder="نام کلاس" aria-label="نام کلاس جدید" aria-describedby="classCreateError" required maxlength="500" style="flex:1"><button type="submit" data-mutating="1">افزودن کلاس</button><p id="classCreateError" class="entity-create-error" role="alert"></p></form></div>';
        return h;
      }

      function renderClass() {
        const c = getClassObj(state.schoolId, state.classId);
        if (!c) {
          state.view = "school";
          return renderSchool();
        }
        const school = getSchool(state.schoolId);
        let h = headerHtml();
        h += `<div class="breadcrumb"><a onclick="goSchools()">مدارس</a> ← <a onclick="goSchool('${school.id}')">${esc(school.name)}</a> ← ${esc(c.name)}</div>`;
        h +=
          '<div class="class-context-actions no-print"><button onclick="openReportScope(\'' +
          esc(school.id) +
          "','" +
          esc(c.id) +
          "','karnameh')\">کارنامه این کلاس</button><button class=\"ghost\" onclick=\"goMaster('" +
          esc(c.id) +
          "')\">برنامه کلاس</button></div>";
        h +=
          '<div class="entity-context-edit no-print"><button class="ghost" data-mutating="1" onclick="EduV24.openEntityEditor(\'class\',\'' +
          esc(c.id) +
          "','" +
          esc(school.id) +
          "')\">ویرایش مشخصات کلاس</button></div>";
        h += `<div class="tabs">
    <button class="${state.tab === "lessons" ? "active" : ""}" onclick="setTab('lessons')">📚 دروس</button>
    <button class="${state.tab === "students" ? "active" : ""}" onclick="setTab('students')">👥 دانش‌آموزان</button>
  </div>`;
        if (state.tab === "lessons") h += renderLessonsTab(c);
        else h += renderStudentsTab(c);
        return h;
      }

      function renderLessonsTab(c) {
        const lessons = c.lessons || [];
        const book =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/></svg>';
        let h =
          '<section class="lesson-schedule no-print"><div><strong>برنامه هفتگی کلاس</strong><p>روز و ساعت برگزاری درس‌ها را تنظیم کنید.</p></div><button class="ghost" onclick="goMaster(\'' +
          esc(c.id) +
          "')\">مشاهده برنامه ←</button></section>";
        h +=
          '<details class="card lesson-create no-print" ' +
          (!lessons.length ? "open" : "") +
          '><summary><span><strong>افزودن درس جدید</strong><small>تعریف درس و روش ارزشیابی</small></span><span class="lesson-plus" aria-hidden="true">+</span></summary><form onsubmit="addLesson(event)" class="lesson-create-form"><label>نام درس<input name="name" placeholder="مثلاً دانش فنی پایه" required></label><label>نام دبیر <span class="muted">(اختیاری)</span><input name="teacher" placeholder="نام و نام خانوادگی"></label><label>زنگ در هفته<input name="periods" type="number" value="2" min="1" max="10" required inputmode="numeric"></label><label>روش ارزشیابی<select name="gradeMode"><option value="kardanesh">کاردانش — عملی و تئوری</option><option value="standard">فنی — پودمان و واحد کار</option></select></label><button type="submit">افزودن درس</button></form><p class="lesson-form-note">کاردانش: عملی ۷۰٪ و تئوری ۳۰٪. فنی: پودمان و واحد کار. تنظیمات بیشتر در صورت نیاز در دسترس است.</p></details>';
        h +=
          '<section class="card class-lessons"><header class="lesson-list-heading"><div><h3>دروس کلاس <span class="lesson-count">' +
          lessons.length.toLocaleString("fa-IR") +
          '</span></h3><p>ورود به درس، ثبت نمره و مدیریت ارزشیابی</p></div></header><div class="lesson-items">';
        if (!lessons.length)
          h +=
            '<div class="empty lesson-empty">' +
            book +
            "<strong>اولین درس کلاس را تعریف کنید</strong><p>نام درس و روش ارزشیابی را در فرم بالا وارد کنید.</p></div>";
        for (const l of lessons) {
          const id = esc(l.id),
            dual = l.gradeMode === "kardanesh";
          h +=
            '<article class="lesson-item"><div class="lesson-identity"><span class="lesson-symbol ' +
            (dual ? "dual" : "modular") +
            '">' +
            book +
            "</span><div><h4>" +
            esc(l.name) +
            "</h4><p>" +
            esc(l.teacher || "دبیر تعیین نشده") +
            '</p></div></div><div class="lesson-meta"><span class="lesson-mode ' +
            (dual ? "dual" : "modular") +
            '">' +
            (dual ? "نظری و عملی" : "پودمانی") +
            '</span><span class="lesson-period">' +
            Number(l.periodsPerWeek || 2).toLocaleString("fa-IR") +
            ' زنگ در هفته</span></div><p class="lesson-policy">' +
            esc(EduPolicy.describe(l)) +
            '</p><div class="lesson-actions no-print"><button class="lesson-enter" onclick="goLesson(\'' +
            id +
            '\')">ورود به درس <span aria-hidden="true">←</span></button><button class="ghost" onclick="openBulkScoreModal(\'' +
            id +
            '\')">ثبت گروهی نمره</button><button class="lesson-config ghost" onclick="openLessonConfig(\'' +
            id +
            '\')">تنظیمات درس</button><details class="lesson-more"><summary id="lesson-menu-' +
            id +
            '" aria-label="عملیات بیشتر برای ' +
            esc(l.name) +
            '">بیشتر</summary><div class="lesson-more-menu">' +
            (!dual && l.poudmans.length
              ? '<button class="ghost" data-mutating="1" onclick="EduV24.course.openNames(\'' +
                id +
                "').catch(EduV24.course.error)\">ویرایش نام پودمان‌ها</button>"
              : "") +
            '<button class="ghost" onclick="EduV24.course.copy(\'' +
            id +
            '\').catch(EduV24.course.error)">کپی تعریف بدون نمرات</button><button class="danger" onclick="deleteLesson(\'' +
            id +
            "')\">حذف درس</button></div></details></div></article>";
        }
        return h + "</div></section>";
      }

      function filterStudentRoster(control) {
        const root = control.closest(".student-directory"),
          list = root.querySelector(".student-roster");
        const norm = (s) =>
          String(s || "")
            .replace(/ي/g, "ی")
            .replace(/ك/g, "ک")
            .replace(/[۰-۹]/g, (c) => c.charCodeAt(0) - 1776)
            .replace(/[٠-٩]/g, (c) => c.charCodeAt(0) - 1632)
            .replace(/‌/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        const query = norm(root.querySelector('input[type="search"]').value),
          sort = root.querySelector("select").value,
          collator = new Intl.Collator("fa", {
            numeric: true,
            sensitivity: "base",
          });
        const cards = [...list.children];
        cards.sort((a, b) => {
          if (sort === "family")
            return Number(a.dataset.order) - Number(b.dataset.order);
          if (sort === "code") {
            if (!a.dataset.code)
              return b.dataset.code
                ? 1
                : Number(a.dataset.order) - Number(b.dataset.order);
            if (!b.dataset.code) return -1;
            return (
              collator.compare(norm(a.dataset.code), norm(b.dataset.code)) ||
              Number(a.dataset.order) - Number(b.dataset.order)
            );
          }
          return (
            collator.compare(a.dataset.name, b.dataset.name) ||
            Number(a.dataset.order) - Number(b.dataset.order)
          );
        });
        let count = 0;
        for (const card of cards) {
          card.hidden = !norm(
            card.dataset.name + " " + card.dataset.code,
          ).includes(query);
          if (!card.hidden) count++;
          list.append(card);
        }
        root.querySelector(".roster-results").textContent =
          count.toLocaleString("fa-IR") +
          " نفر از " +
          cards.length.toLocaleString("fa-IR") +
          " هنرجو";
        root.querySelector(".roster-no-results").hidden =
          count > 0 || cards.length === 0;
      }
      function renderStudentsTab(c) {
        const students = getSortedStudents(c);
        let h =
          '<details class="card quick-create student-add" ' +
          (!students.length ? "open" : "") +
          '><summary>افزودن هنرجوی جدید</summary><form onsubmit="addStudent(event)" class="student-add-form" data-entity-create="student" novalidate><label>نام و نام خانوادگی<input id="studentCreateName" name="name" aria-describedby="studentCreateError" placeholder="نام کامل هنرجو" required maxlength="200"></label><label>کد دانش‌آموزی <span class="muted">(اختیاری)</span><input id="studentCreateCode" name="code" maxlength="120" aria-describedby="studentCreateError" placeholder="کد یکتا در کلاس" inputmode="numeric"></label><button type="submit">افزودن هنرجو</button><p id="studentCreateError" class="entity-create-error" role="alert"></p></form></details>';
        h +=
          '<details class="card student-import no-print"><summary>افزودن گروهی از فایل CSV</summary><p>ابتدا قالب را بگیرید، نام هنرجویان را وارد کنید و فایل تکمیل‌شده را برای بررسی بارگذاری کنید.</p><div class="row"><button class="ghost" onclick="downloadExcelTemplate()">دریافت قالب CSV</button><button onclick="document.getElementById(\'excelFile\').click()">انتخاب فایل CSV</button></div></details>';
        h +=
          '<section class="card student-directory"><header class="roster-heading"><div><h3>هنرجویان کلاس <span class="lesson-count">' +
          students.length.toLocaleString("fa-IR") +
          "</span></h3><p>مشخصات، کارنامه و مدیریت اعضای کلاس</p></div></header>";
        if (!students.length)
          h +=
            '<div class="empty"><strong>هنوز هنرجویی در این کلاس نیست</strong><p>از فرم بالا یک هنرجو اضافه کنید یا فهرست کلاس را با CSV وارد کنید.</p></div>';
        h +=
          '<div class="roster-toolbar no-print" ' +
          (!students.length ? "hidden" : "") +
          '><label class="roster-search"><span>جست‌وجو در کلاس</span><input type="search" placeholder="نام یا کد دانش‌آموزی…" oninput="filterStudentRoster(this)"></label><label class="roster-sort"><span>مرتب‌سازی</span><select onchange="filterStudentRoster(this)"><option value="family">نام خانوادگی</option><option value="name">نام</option><option value="code">کد دانش‌آموزی</option></select></label></div><p class="roster-results" role="status" aria-live="polite">' +
          students.length.toLocaleString("fa-IR") +
          " نفر از " +
          students.length.toLocaleString("fa-IR") +
          ' هنرجو</p><div class="student-roster">';
        for (const [i, st] of students.entries()) {
          const id = esc(st.id),
            initial = esc(
              st.name
                .trim()
                .split(/\s+/)
                .map((x) => [...x][0])
                .filter(Boolean)
                .slice(0, 2)
                .join(" "),
            );
          h +=
            '<article class="student-profile" data-name="' +
            esc(st.name) +
            '" data-code="' +
            esc(st.code || "") +
            '" data-order="' +
            i +
            '"><div class="student-profile-main"><span class="student-avatar" aria-hidden="true">' +
            initial +
            '</span><div class="student-profile-info"><h4>' +
            esc(st.name) +
            "</h4><p>" +
            (st.code
              ? "کد دانش‌آموزی: <bdi>" + esc(st.code) + "</bdi>"
              : '<span class="student-code-missing">کد ثبت نشده</span>') +
            '</p></div><span class="student-row-number" aria-label="ردیف ' +
            (i + 1) +
            '">' +
            (i + 1).toLocaleString("fa-IR") +
            '</span></div><div class="student-profile-actions no-print"><button class="ghost" onclick="openEditStudentModal(\'' +
            id +
            "')\">ویرایش مشخصات</button><button class=\"student-report\" onclick=\"showModal('کارنامه هنرجو',buildDetailedKarnamehHtml(getClassObj(state.schoolId,state.classId),'" +
            id +
            '\'))">کارنامه</button><details class="student-more"><summary id="student-menu-' +
            esc(c.id) +
            "-" +
            id +
            '" aria-label="عملیات بیشتر برای ' +
            esc(st.name) +
            '">بیشتر</summary><div class="student-more-menu"><button class="ghost" onclick="openTransferModal(\'' +
            id +
            '\')">انتقال / کپی به کلاس دیگر</button><button class="danger" onclick="deleteStudent(\'' +
            id +
            "')\">بایگانی هنرجو</button></div></details></div></article>";
        }
        h +=
          '</div><div class="empty roster-no-results" hidden>هنرجویی پیدا نشد؛ نام یا کد دیگری جست‌وجو کنید.</div></section>';
        return h + buildArchiveHtml(c);
      }

      // Keep the link alive while mobile browsers hand the file to their download manager.
      function downloadLocalFile(blob, name) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.hidden = true;
        document.body.append(link);
        const cleanup = () => {
          link.remove();
          URL.revokeObjectURL(url);
        };
        try {
          link.click();
        } catch (error) {
          cleanup();
          throw error;
        }
        setTimeout(cleanup, 60000);
      }
      function downloadExcelTemplate() {
        const csv =
          "\uFEFF" +
          "ردیف,نام و نام خانوادگی\n1,مثال: علی رضایی\n2,مثال: محمد احمدی\n";
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        downloadLocalFile(blob, "قالب-دانش‌آموزان.csv");
      }
      function handleExcelImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const schoolId = state.schoolId,
          classId = state.classId;
        if (file.size > 5 * 1024 * 1024) {
          e.target.value = "";
          return alert("حداکثر حجم CSV پنج مگابایت است.");
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const c = getClassObj(schoolId, classId);
            if (!c) throw Error("کلاس مقصد دیگر وجود ندارد.");
            const rows = parseCSV(ev.target.result);
            if (rows.length < 2)
              throw Error("CSV باید سرستون و دست‌کم یک ردیف داشته باشد.");
            const column = rows[0].findIndex((x) =>
              normalizedName(x).includes("نام"),
            );
            if (column < 0) throw Error("ستون نام یافت نشد.");
            const known = new Set(
              c.students.map((x) => normalizedName(x.name)),
            );
            let duplicate = 0,
              skipped = 0;
            const added = [];
            rows.slice(1).forEach((row, index) => {
              if (row.length !== rows[0].length)
                throw Error("تعداد ستون نامعتبر در ردیف " + (index + 2));
              const name = normalizedName(row[column]);
              if (!name || name.includes("مثال:")) {
                skipped++;
                return;
              }
              if (name.length > 200 || /[\r\n<>]/.test(name))
                throw Error("نام نامعتبر در ردیف " + (index + 2));
              if (known.has(name)) {
                duplicate++;
                return;
              }
              known.add(name);
              added.push({ id: uid(), name });
            });
            if (added.length) {
              c.students.push(...added);
              saveDB();
              render();
            }
            alert(
              "افزوده: " +
                added.length +
                " | تکراری: " +
                duplicate +
                " | خالی یا نمونه: " +
                skipped,
            );
          } catch (err) {
            alert("ورود CSV انجام نشد: " + err.message);
          } finally {
            e.target.value = "";
          }
        };
        reader.onerror = () => {
          e.target.value = "";
          alert("خواندن CSV انجام نشد.");
        };
        reader.readAsText(file, "UTF-8");
      }

      function openEditStudentModal(stId) {
        const c = getClassObj(state.schoolId, state.classId);
        const student = getStudentObj(c, stId);
        if (!student) return;
        let h = `<div class="form-row"><label>نام و نام خانوادگی:</label>
    <input type="text" id="editStudentName" value="${esc(student.name)}" style="flex:1" required></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px">
      <button class="ghost" onclick="closeModal()">انصراف</button>
      <button onclick="saveEditStudent('${stId}')">💾 ذخیره</button>
    </div>`;
        showModal("✏️ ویرایش نام دانش‌آموز", h);
      }
      async function saveEditStudent(stId) {
        const c = getClassObj(state.schoolId, state.classId);
        const student = getStudentObj(c, stId);
        if (!student) return;
        const newName = document.getElementById("editStudentName").value.trim();
        if (!newName) return alert("نام نمی‌تواند خالی باشد");
        student.name = newName;
        await saveDB({ classId: c.id });
        closeModal();
      }

      function renderLesson() {
        const c = getClassObj(state.schoolId, state.classId);
        if (!c) {
          state.view = "class";
          return renderClass();
        }
        const lesson = getLessonObj(c, state.lessonId);
        if (!lesson) {
          state.view = "class";
          return renderClass();
        }
        const school = getSchool(state.schoolId);
        let h = headerHtml();
        h += `<div class="breadcrumb">
    <a onclick="goSchools()">مدارس</a> ←
    <a onclick="goSchool('${school.id}')">${esc(school.name)}</a> ←
    <a onclick="backToClass()">${esc(c.name)}</a> ←
    <strong>${esc(lesson.name)}</strong>${lesson.teacher ? ` <span class="muted">(${esc(lesson.teacher)})</span>` : ""}
  </div>`;
        h += `<div class="tabs">
    <button class="${state.tab === "students" ? "active" : ""}" onclick="setTab('students')">👥 دانش‌آموزان</button>
    <button class="${state.tab === "sessions" ? "active" : ""}" onclick="setTab('sessions')">📅 جلسات</button>
    <button class="${state.tab === "grades" ? "active" : ""}" onclick="setTab('grades')">📝 نمرات</button>
  </div>`;
        if (state.tab === "students") h += renderLessonStudents(c, lesson);
        else if (state.tab === "sessions") h += renderLessonSessions(c, lesson);
        else h += `<div id="lessonGradesArea"></div>`;
        return h;
      }

      function renderLessonStudents(c, lesson) {
        if (lesson.gradeMode === "kardanesh")
          return buildKardaneshSummaryHtml(c, lesson);
        let h = `<div class="card"><h3>👥 دانش‌آموزان این درس</h3>
    <p class="muted" style="font-size:.85em">آمار عملکرد دانش‌آموزان در هر درس به تفکیک پودمان و واحد.</p>
  </div><div class="card" style="overflow-x:auto">`;
        if (!c.students.length) h += `<div class="empty">دانش‌آموزی نیست</div>`;
        else {
          const sortedStudents = getSortedStudents(c);
          h += `<table class="karnameh-table"><thead><tr>
      <th rowspan="2">#</th><th rowspan="2">نام</th>`;
          lesson.poudmans.forEach((p) => {
            p.units.forEach((u) => {
              h += `<th colspan="5" style="text-align:center;border-right:2px solid #cbd5e1">${esc(p.name)} / ${esc(u.name)}</th>`;
            });
          });
          h += `<th colspan="2" style="background:#eef2ff;color:#4338ca;text-align:center">کل درس</th></tr><tr>`;
          lesson.poudmans.forEach((p) => {
            p.units.forEach((u) => {
              h += `<th style="font-size:.75em;color:#059669">➕ مثبت</th><th style="font-size:.75em;color:#dc2626">➖ منفی</th><th style="font-size:.75em">📝 تکلیف</th><th style="font-size:.75em;color:#059669">✅ حاضر</th><th style="font-size:.75em;color:#d97706">⏰ تأخیر</th>`;
            });
          });
          h += `<th style="font-size:.75em;color:#059669;background:#eef2ff">➕ مثبت</th><th style="font-size:.75em;color:#dc2626;background:#eef2ff">➖ منفی</th>`;
          h += `</tr></thead><tbody>`;

          sortedStudents.forEach((s, i) => {
            const stats = calcStudentLesson(c, lesson, s.id);
            h += `<tr><td>${i + 1}</td><td>${esc(s.name)}</td>`;
            lesson.poudmans.forEach((p) => {
              p.units.forEach((u) => {
                const d = stats.details[p.id][u.id];
                h += `<td style="color:#059669;text-align:center">${d.pos || 0}</td><td style="color:#dc2626;text-align:center">${d.neg || 0}</td><td style="text-align:center">${d.hw || 0}</td><td style="color:#059669;text-align:center">${d.att.present || 0}</td><td style="color:#d97706;text-align:center">${d.att.late || 0}</td>`;
              });
            });
            h += `<td style="color:#059669;text-align:center;background:#eef2ff;font-weight:bold">${stats.posCount}</td><td style="color:#dc2626;text-align:center;background:#eef2ff;font-weight:bold">${stats.negCount}</td>`;
            h += `</tr>`;
          });
          h += `</tbody></table>`;
        }
        h += `</div>`;
        return h;
      }

      function renderLessonSessions(c, lesson) {
        const sessions = db.sessions
          .filter((s) => s.classId === c.id && s.lessonId === lesson.id)
          .sort((a, b) => b.date.localeCompare(a.date) || b.period - a.period);
        const lessonId = esc(lesson.id),
          classId = esc(c.id);
        let h =
          '<section class="card session-create"><h3>شروع جلسه</h3><form class="session-create-form" onsubmit="addManualSession(event,\'' +
          lessonId +
          "')\">" +
          '<label>تاریخ جلسه<input type="date" name="date" required value="' +
          todayISO() +
          '"></label>' +
          '<label>شماره زنگ<input type="number" name="period" min="1" max="12" required value="1" inputmode="numeric"></label>' +
          '<button type="submit">شروع / ادامه جلسه</button></form></section>';
        h +=
          '<section class="card session-directory"><header class="session-list-heading"><h3>جلسات درس <span class="lesson-count">' +
          sessions.length.toLocaleString("fa-IR") +
          "</span></h3>";
        if (sessions.length)
          h +=
            '<details class="session-list-actions"><summary>گزینه‌ها</summary><div><button class="danger" onclick="deleteAllSessions(\'' +
            classId +
            "','" +
            lessonId +
            "')\">حذف همه جلسات</button></div></details>";
        h += "</header>";
        if (!sessions.length)
          h +=
            '<div class="empty"><strong>اولین جلسه را شروع کنید</strong><p>تاریخ و زنگ را در فرم بالا انتخاب کنید؛ سپس حضور و فعالیت کلاس را ثبت کنید.</p></div>';
        for (const session of sessions) {
          const counts = { present: 0, absent: 0, late: 0 };
          for (const value of Object.values(session.attendance || {})) {
            if (value === "present" || value === "absent") counts[value]++;
            else if (typeof value === "string" && value.startsWith("late"))
              counts.late++;
          }
          const pod = lesson.poudmans.find((p) => p.id === session.poudmanId);
          const unit = pod?.units.find((u) => u.id === session.unitId);
          const id = esc(session.id),
            title =
              faDate(session.date) +
              " · زنگ " +
              (session.period + 1).toLocaleString("fa-IR");
          h +=
            '<article class="session-card"><button type="button" class="session-open" onclick="openExistingSession(\'' +
            id +
            '\')" aria-label="ورود به جلسه ' +
            esc(title) +
            '"><strong>' +
            esc(title) +
            "</strong>";
          if (pod || unit)
            h +=
              '<span class="session-unit">' +
              esc([pod?.name, unit?.name].filter(Boolean).join(" / ")) +
              "</span>";
          h +=
            '<span class="session-counts"><span>حاضر ' +
            counts.present.toLocaleString("fa-IR") +
            "</span><span>غایب " +
            counts.absent.toLocaleString("fa-IR") +
            "</span><span>تأخیر " +
            counts.late.toLocaleString("fa-IR") +
            "</span><span>" +
            session.scores.length.toLocaleString("fa-IR") +
            ' فعالیت</span></span></button><button type="button" class="session-delete" onclick="deleteSession(\'' +
            id +
            '\')" aria-label="حذف جلسه ' +
            esc(title) +
            '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button></article>';
        }
        return h + "</section>";
      }

      async function deleteSession(sessId) {
        if (
          !confirm(
            "آیا از حذف این جلسه مطمئن هستید؟ اطلاعات حضور و نمرات آن پاک خواهد شد.",
          )
        )
          return;
        db.sessions = db.sessions.filter((s) => s.id !== sessId);
        await saveDB();
        render();
      }

      async function deleteAllSessions(classId, lessonId) {
        if (
          !confirm(
            "⚠️ هشدار: آیا از حذف تمام جلسات این درس مطمئن هستید؟ تمام حضور و غیاب‌ها و نمرات ثبت شده در این جلسات برای همیشه پاک می‌شوند.",
          )
        )
          return;
        db.sessions = db.sessions.filter(
          (s) => !(s.classId === classId && s.lessonId === lessonId),
        );
        await saveDB();
        render();
      }

      async function addManualSession(e, lessonId) {
        e.preventDefault();
        const c = getClassObj(state.schoolId, state.classId);
        const date = e.target.date.value;
        const period = parseInt(e.target.period.value) - 1;
        if (!date || isNaN(period) || period < 0)
          return alert("اطلاعات نامعتبر");
        const existing = db.sessions.find(
          (s) => s.classId === c.id && s.date === date && s.period === period,
        );
        if (existing) {
          const existingLesson = getLessonObj(c, existing.lessonId);
          const message =
            existing.lessonId === lessonId
              ? "جلسه همین درس در این تاریخ و زنگ وجود دارد. ادامه داده شود؟"
              : "این زنگ به درس «" +
                (existingLesson?.name || "درس دیگر") +
                "» تعلق دارد، نه «" +
                (getLessonObj(c, lessonId)?.name || "درس انتخاب‌شده") +
                "».\n" +
                faDate(date) +
                "، زنگ " +
                (period + 1) +
                "\nآیا وارد جلسه درس «" +
                (existingLesson?.name || "درس دیگر") +
                "» می‌شوید؟";
          if (confirm(message)) openSessionModal(existing);
          return;
        }
        const newSession = {
          id: uid(),
          schoolId: state.schoolId,
          classId: c.id,
          date,
          period,
          lessonId,
          poudmanId: null,
          unitId: null,
          attendance: {},
          scores: [],
          roster: snapshotRoster(c),
        };
        db.sessions.push(newSession);
        await saveDB({ sessionId: newSession.id });
        openSessionModal(newSession);
      }

      function buildLessonGradesHtml(c, lesson) {
        if (lesson.gradeMode === "kardanesh")
          return buildKardaneshGradesHtml(c, lesson);
        let allPos = true,
          allNeg = true,
          allHw = true,
          allPresent = true,
          allLate = true;
        let hasUnits = false;
        lesson.poudmans.forEach((p) =>
          p.units.forEach((u) => {
            hasUnits = true;
            const ao = u.applyOptions || {};
            if (!ao.pos) allPos = false;
            if (!ao.neg) allNeg = false;
            if (!ao.hw) allHw = false;
            if (!ao.present) allPresent = false;
            if (!ao.late) allLate = false;
          }),
        );
        if (!hasUnits) {
          allPos = false;
          allNeg = false;
          allHw = false;
          allPresent = false;
          allLate = false;
        }

        let h = `<div class="card"><h3>📝 نمرات تفصیلی — ${esc(lesson.name)}</h3>
    <div class="row no-print" style="justify-content:flex-end;margin-bottom:10px">
      <button class="success" onclick="openBulkScoreModal('${lesson.id}')">📝 ثبت گروهی همه نمرات</button>
    </div>
    <p class="muted" style="font-size:.85em">نمره واحد = میانگین وزنی مستمر و پایانی با امتیازات انتخاب‌شده (صفر تا ۲۰). آخرین نمره تاریخ‌دار ملاک است؛ ثبت گروهی اولویت دارد. نهایی درس پس از تکمیل همه واحدها صادر می‌شود.</p>
    <div class="filter-units-box no-print">
      <div style="font-weight:700;color:#3730a3;font-size:.9em">⚙️ اعمال در نمره هر واحد (اعمال روی همه واحدها):</div>
      <div class="chips">
        <label><input type="checkbox" ${allPos ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','pos',this.checked)"> ➕ مثبت‌ها</label>
        <label><input type="checkbox" ${allNeg ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','neg',this.checked)"> ➖ منفی‌ها</label>
        <label><input type="checkbox" ${allHw ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','hw',this.checked)"> 📝 تکالیف</label>
        <label><input type="checkbox" ${allPresent ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','present',this.checked)"> ✅ حضور</label>
        <label><input type="checkbox" ${allLate ? "checked" : ""} onchange="toggleAllApplyForLessonInLesson('${lesson.id}','late',this.checked)"> ⏰ تأخیر</label>
      </div>
    </div>
    <div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
      <th rowspan="2">دانش‌آموز</th>`;

        lesson.poudmans.forEach((p) => {
          p.units.forEach((u) => {
            h += `<th colspan="3" style="text-align:center;border-right:2px solid #e2e8f0">${esc(p.name)} / ${esc(u.name)}</th>`;
          });
        });
        h += `<th rowspan="2" style="background:#eef2ff;color:#4338ca">نهایی درس</th></tr><tr>`;

        lesson.poudmans.forEach((p) => {
          p.units.forEach((u) => {
            h += `<th style="font-size:.75em;text-align:center">مستمر</th><th style="font-size:.75em;text-align:center">پایانی</th><th style="font-size:.75em;text-align:center;background:#f0fdf4;color:#166534">واحد</th>`;
          });
        });
        h += `</tr></thead><tbody>`;

        const sortedStudents = getSortedStudents(c);
        sortedStudents.forEach((st, i) => {
          const stats = calcStudentLesson(c, lesson, st.id);
          h += `<tr><td>${esc(st.name)}</td>`;
          lesson.poudmans.forEach((p) => {
            p.units.forEach((u) => {
              const d = stats.details[p.id][u.id];
              h += `<td style="text-align:center">${d.m !== null ? d.m : "—"}</td>`;
              h += `<td style="text-align:center">${d.p !== null ? d.p : "—"}</td>`;
              h += `<td style="text-align:center;background:#f0fdf4;font-weight:600;color:#166534">${d.final !== null ? d.final.toFixed(2) : "—"}</td>`;
            });
          });
          h += `<td style="background:#eef2ff;font-weight:700;color:#4338ca;text-align:center">${stats.final !== null ? stats.final.toFixed(2) : "—"}</td></tr>`;
        });
        h += `</tbody></table></div></div>`;

        h += `<div class="card"><h3>⚙️ تنظیمات اعمال هر واحد</h3>
    <p class="muted" style="font-size:.85em">برای هر واحد جداگانه مشخص کنید چه چیزی در نمره نهایی آن واحد تأثیر داشته باشد.</p>
    <div style="overflow-x:auto"><table class="karnameh-table"><thead><tr>
      <th>پودمان</th><th>واحد</th><th>➕ مثبت</th><th>➖ منفی</th><th>📝 تکلیف</th><th>✅ حضور</th><th>⏰ تأخیر</th>
    </tr></thead><tbody>`;
        lesson.poudmans.forEach((p) => {
          p.units.forEach((u, ui) => {
            const ao = u.applyOptions || {};
            h += `<tr>`;
            if (ui === 0)
              h += `<td rowspan="${p.units.length}">${esc(p.name)}</td>`;
            h += `<td>${esc(u.name)}</td>
        <td><input type="checkbox" ${ao.pos ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','pos',this.checked)"></td>
        <td><input type="checkbox" ${ao.neg ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','neg',this.checked)"></td>
        <td><input type="checkbox" ${ao.hw ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','hw',this.checked)"></td>
        <td><input type="checkbox" ${ao.present ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','present',this.checked)"></td>
        <td><input type="checkbox" ${ao.late ? "checked" : ""} onchange="toggleUnitApplyDirect('${lesson.id}','${p.id}','${u.id}','late',this.checked)"></td></tr>`;
          });
        });
        h += `</tbody></table></div></div>`;
        return h;
      }

      async function toggleAllApplyForLessonInLesson(lessonId, key, checked) {
        const c = getClassObj(state.schoolId, state.classId);
        if (!c) return;
        const lesson = getLessonObj(c, lessonId);
        if (!lesson) return;
        lesson.poudmans.forEach((p) =>
          p.units.forEach((u) => {
            if (!u.applyOptions) u.applyOptions = {};
            u.applyOptions[key] = checked;
          }),
        );
        await saveDB({ classId: c.id });

        const area = document.getElementById("lessonGradesArea");
        if (area) {
          const c2 = getClassObj(state.schoolId, state.classId);
          const l2 = getLessonObj(c2, lessonId);
          if (c2 && l2) area.innerHTML = buildLessonGradesHtml(c2, l2);
        }
      }

      function generateSessionReportText(session, c, lesson) {
        const present = [],
          absent = [],
          late = [],
          pos = [],
          neg = [],
          hw = [];
        sessionStudents(c, session).forEach((s) => {
          const st = session.attendance[s.id];
          if (st === "present") present.push(s.name);
          else if (st === "absent") absent.push(s.name);
          else if (st && st.startsWith("late")) {
            const mins = st.includes(":") ? st.split(":")[1] : "0";
            late.push(`${s.name} (${mins} دقیقه)`);
          }
        });
        session.scores.forEach((sc) => {
          const s = sessionStudent(c, session, sc.studentId);
          if (!s) return;
          if (sc.type === "positive") pos.push(`${s.name} (${sc.value})`);
          else if (sc.type === "negative") neg.push(`${s.name} (${sc.value})`);
          else if (sc.type === "homework")
            hw.push(`${s.name} (${sc.note || "ثبت شد"})`);
        });
        const poudman = lesson.poudmans.find((p) => p.id === session.poudmanId);
        const unit = poudman
          ? poudman.units.find((u) => u.id === session.unitId)
          : null;
        let text = `📅 تاریخ: ${faDate(session.date)} | زنگ ${session.period + 1}\n`;
        text += `📚 کلاس: ${c.name} | درس: ${lesson.name} | دبیر: ${lesson.teacher || "---"}\n`;
        if (poudman)
          text += `📍 پودمان: ${poudman.name} | ${unit ? unit.name : ""}\n`;
        text += `\n👥 وضعیت حضور:\n✅ حاضر (${present.length} نفر): ${present.length ? present.join("، ") : "---"}\n❌ غایب (${absent.length} نفر): ${absent.length ? absent.join("، ") : "---"}\n⏰ تأخیر (${late.length} نفر): ${late.length ? late.join("، ") : "---"}\n`;
        if (pos.length || neg.length || hw.length) {
          text += `\n📝 موارد ثبت شده:\n`;
          if (pos.length)
            text += `➕ مثبت (${pos.length}): ${pos.join("، ")}\n`;
          if (neg.length)
            text += `➖ منفی (${neg.length}): ${neg.join("، ")}\n`;
          if (hw.length) text += `📋 تکلیف (${hw.length}): ${hw.join("، ")}\n`;
        }
        const marks = session.scores.filter((score) =>
          ["classGrade", "activity", "mostamar", "payani"].includes(score.type),
        );
        if (marks.length)
          text +=
            "\nنمرات و امتیازهای ثبت‌شده:\n" +
            marks
              .map((score) => {
                const student = sessionStudent(c, session, score.studentId);
                return (
                  (student?.name || "هنرجوی نامشخص") +
                  " · " +
                  TYPE_LABELS[score.type] +
                  ": " +
                  score.value +
                  (score.note ? " · " + score.note : "")
                );
              })
              .join("\n") +
            "\n";
        return text;
      }

      function selectScheduleDay(day) {
        state.scheduleDay = Number(day);
        render();
      }
      function renderMaster() {
        const today = todayIdx(),
          date = todayISO(),
          parity = getWeekParity(date);
        const days = [...(db.activeDays || [0, 1, 2, 3, 4, 5])].sort(
            (a, b) => a - b,
          ),
          periods = db.periods || 6;
        const selected = days.includes(state.scheduleDay)
          ? state.scheduleDay
          : days.includes(today)
            ? today
            : days[0];
        const number = (n) => n.toLocaleString("fa-IR");
        let weekly = 0;
        for (const day of days)
          for (let p = 0; p < periods; p++) {
            const e = getMasterEntry(day, p, date);
            if (e && (!state.masterFilter || e.classId === state.masterFilter))
              weekly++;
          }
        const slot = (day, p, compact = false) => {
          const entry = getMasterEntry(day, p, date),
            other =
              entry &&
              state.masterFilter &&
              entry.classId !== state.masterFilter;
          const cls = entry ? findClassById(entry.classId) : null,
            lesson = cls ? getLessonObj(cls.classObj, entry.lessonId) : null;
          const filled = entry && !other && lesson;
          let s =
            '<article class="week-slot ' +
            (filled ? "is-filled" : other ? "is-other" : "is-empty") +
            '">';
          if (!compact)
            s +=
              '<div class="week-period"><span>زنگ</span><strong>' +
              number(p + 1) +
              "</strong></div>";
          s += '<div class="week-slot-content">';
          if (filled) {
            s +=
              '<div class="week-class-label"><span class="week-color" style="background:' +
              getClassColor(entry.classId) +
              '"></span>' +
              esc(cls.classObj.name) +
              '<span class="week-school">' +
              esc(cls.school.name) +
              "</span></div><h4>" +
              esc(lesson.name) +
              "</h4><p>" +
              esc(lesson.teacher || "دبیر تعیین نشده") +
              '</p><div class="week-slot-actions no-print"><button onclick="clickMasterCell(' +
              day +
              "," +
              p +
              ')">بازکردن جلسه</button><button class="ghost" onclick="openMasterConfig(' +
              day +
              "," +
              p +
              ')" aria-label="تنظیم ' +
              esc(DAYS[day]) +
              " زنگ " +
              (p + 1) +
              '">تنظیم زنگ</button></div>';
          } else if (other) {
            s +=
              '<h4>برنامه کلاس دیگر</h4><p>کلاس انتخاب‌شده در این زنگ برنامه ندارد.</p><button class="ghost no-print" onclick="clickMasterCell(' +
              day +
              "," +
              p +
              ')">بررسی برنامه</button>';
          } else {
            s +=
              "<h4>" +
              (entry ? "درس نیازمند بررسی است" : "زنگ آزاد") +
              "</h4><p>" +
              (entry
                ? "تعریف درس این زنگ در دسترس نیست."
                : "برای این زنگ کلاس و درس انتخاب کنید.") +
              '</p><button class="week-add ghost no-print" onclick="' +
              (entry ? "openMasterConfig" : "clickMasterCell") +
              "(" +
              day +
              "," +
              p +
              ')">+ تنظیم برنامه</button>';
          }
          return s + "</div></article>";
        };
        let h = headerHtml();
        h +=
          "<header class=\"week-heading\"><div><p>برنامه آموزشی شما</p><h2>برنامه هفتگی</h2></div><button class=\"ghost no-print\" onclick=\"document.querySelector('.week-settings').open=true;document.querySelector('.week-settings').scrollIntoView({block:'start'});\">تنظیمات برنامه</button></header>";
        h +=
          '<section class="card week-overview"><div class="week-overview-info"><span class="week-parity ' +
          parity +
          '">هفته ' +
          (parity === "odd" ? "فرد" : "زوج") +
          "</span><strong>از " +
          esc(faDate(getSaturdayOf(date))) +
          "</strong><span>" +
          number(weekly) +
          ' زنگ برنامه‌ریزی‌شده</span></div><label class="week-filter no-print">نمایش برنامه کلاس<select onchange="state.masterFilter=this.value||null;render()"><option value="">همه کلاس‌ها</option>';
        for (const school of db.schools)
          for (const c of school.classes)
            h +=
              '<option value="' +
              esc(c.id) +
              '" ' +
              (state.masterFilter === c.id ? "selected" : "") +
              ">" +
              esc(school.name) +
              " — " +
              esc(c.name) +
              "</option>";
        h += "</select></label></section>";
        if (!days.length)
          h +=
            '<div class="card empty"><strong>روز کاری انتخاب نشده است</strong><p>از تنظیمات برنامه، روزهای تدریس خود را فعال کنید.</p></div>';
        else {
          h +=
            '<section class="week-agenda"><nav class="week-day-picker no-print" aria-label="انتخاب روز برنامه">';
          for (const d of days)
            h +=
              '<button type="button" aria-pressed="' +
              (d === selected) +
              '" onclick="selectScheduleDay(' +
              d +
              ')"><span>' +
              esc(DAYS[d]) +
              "</span>" +
              (d === today ? "<small>امروز</small>" : "") +
              "</button>";
          const count = Array.from({ length: periods }, (_, p) =>
            getMasterEntry(selected, p, date),
          ).filter(
            (e) =>
              e && (!state.masterFilter || e.classId === state.masterFilter),
          ).length;
          h +=
            '</nav><div class="week-day-heading"><h3>' +
            esc(DAYS[selected]) +
            "</h3><span>" +
            number(count) +
            " زنگ دارای برنامه · " +
            number(periods) +
            ' زنگ</span></div><div class="week-slot-list">';
          for (let p = 0; p < periods; p++) h += slot(selected, p);
          h += "</div></section>";
          h +=
            '<section class="card week-desktop"><header><h3>نمای کامل هفته</h3><p>برای ثبت اطلاعات، جلسه را باز کنید؛ برای تغییر درس از تنظیم زنگ استفاده کنید.</p></header><div class="table-scroll"><table class="week-table"><thead><tr><th>روز / زنگ</th>';
          for (let p = 0; p < periods; p++)
            h += "<th>زنگ " + number(p + 1) + "</th>";
          h += "</tr></thead><tbody>";
          for (const d of days) {
            h +=
              '<tr><td class="week-day-cell">' +
              esc(DAYS[d]) +
              (d === today ? "<small>امروز</small>" : "") +
              "</td>";
            for (let p = 0; p < periods; p++)
              h += "<td>" + slot(d, p, true) + "</td>";
            h += "</tr>";
          }
          h += "</tbody></table></div></section>";
        }
        h +=
          '<details class="card week-settings no-print" ' +
          (state.masterSettingsOpen ? "open" : "") +
          ' ontoggle="state.masterSettingsOpen=this.open"><summary>تنظیمات روزها و زنگ‌ها</summary><section><h4>روزهای کاری</h4><p>روزهای تدریس خود را مشخص کنید.</p><div class="week-working-days">';
        for (const [i, day] of DAYS.entries())
          h +=
            '<label><input type="checkbox" ' +
            (days.includes(i) ? "checked" : "") +
            ' onchange="toggleActiveDay(' +
            i +
            ')"><span>' +
            esc(day) +
            "</span></label>";
        h +=
          '</div></section><section><h4>تعداد زنگ‌های روزانه</h4><div class="week-period-controls"><button class="ghost" onclick="changePeriods(-1)" aria-label="کاهش تعداد زنگ">−</button><strong>' +
          number(periods) +
          ' زنگ</strong><button class="ghost" onclick="changePeriods(1)" aria-label="افزایش تعداد زنگ">+</button></div></section><section><h4>مبنای هفته‌های فرد و زوج</h4><p>تاریخ شنبه‌ای را انتخاب کنید که مبنای محاسبه هفته‌ها باشد.</p><div class="week-start-date"><label>تاریخ شروع<input type="date" id="weekStartInput" data-mutating="1" value="' +
          esc(db.settings.weekStartDate || date) +
          '" onchange="document.getElementById(\'shamsiWeekStart\').textContent=toShamsi(this.value)"></label><span class="shamsi-display" id="shamsiWeekStart">' +
          esc(toShamsi(db.settings.weekStartDate || date)) +
          '</span><button onclick="saveWeekStartDate()">ذخیره تاریخ مبنا</button></div></section></details>';
        return h;
      }

      async function toggleActiveDay(dayIdx) {
        if (!db.activeDays) db.activeDays = [0, 1, 2, 3, 4, 5];
        const idx = db.activeDays.indexOf(dayIdx);
        if (idx === -1) db.activeDays.push(dayIdx);
        else db.activeDays.splice(idx, 1);
        db.activeDays.sort((a, b) => a - b);
        await saveDB();
        render();
      }
      async function saveWeekStartDate() {
        const v = document.getElementById("weekStartInput").value;
        if (!v) return alert("تاریخ را وارد کنید");
        db.settings.weekStartDate = v;
        await saveDB();
        render();
        alert("✅ تاریخ شروع محاسبه ذخیره شد");
      }
      async function changePeriods(d) {
        const next = clamp((db.periods || 6) + d, 1, 12);
        const occupied = Object.entries(db.masterSchedule || {}).filter(
          ([key, value]) => value && Number(key.split("-")[1]) >= next,
        );
        if (next < (db.periods || 6) && occupied.length) {
          alert(
            "کاهش تعداد زنگ‌ها انجام نشد؛ ابتدا برنامه زنگ‌های " +
              [
                ...new Set(
                  occupied.map(([key]) => Number(key.split("-")[1]) + 1),
                ),
              ]
                .sort((a, b) => a - b)
                .join("، ") +
              " را جابه‌جا یا پاک کنید.",
          );
          return;
        }
        db.periods = next;
        await saveDB();
        render();
      }

      function openMasterConfig(day, period) {
        const cur = getBothEntries(day, period);
        const allClasses = [];
        db.schools.forEach((s) =>
          s.classes.forEach((c) => allClasses.push({ school: s, class: c })),
        );
        if (!allClasses.length) {
          showModal(
            "تنظیم زنگ",
            `<p class="empty">ابتدا مدرسه و کلاس بسازید</p><button onclick="closeModal()">بستن</button>`,
          );
          return;
        }
        function classSelect(id, val) {
          return `<select id="${id}" style="flex:1" onchange="updateLessonOptions('${id}')">
      <option value="">— هیچ —</option>
      ${allClasses.map((x) => `<option value="${x.class.id}" ${x.class.id === val ? "selected" : ""}>${esc(x.school.name)} / ${esc(x.class.name)}</option>`).join("")}
    </select>`;
        }
        function lessonSelect(id, classId, lessonId) {
          if (!classId)
            return `<select id="${id}" style="flex:1"><option value="">— اول کلاس —</option></select>`;
          const cls = findClassById(classId);
          if (!cls)
            return `<select id="${id}" style="flex:1"><option value="">— خطا —</option></select>`;
          return `<select id="${id}" style="flex:1">
      <option value="">— درس —</option>
      ${(cls.classObj.lessons || []).map((l) => `<option value="${l.id}" ${l.id === lessonId ? "selected" : ""}>${esc(l.name)}</option>`).join("")}
    </select>`;
        }

        let h =
          '<div class="week-config-intro"><strong>' +
          esc(DAYS[day]) +
          " · زنگ " +
          (period + 1).toLocaleString("fa-IR") +
          '</strong><p>برنامه ثابت را انتخاب کنید؛ اگر درس هفته‌های فرد و زوج متفاوت است، استثناها را هم مشخص کنید.</p></div><section class="week-config-section"><h4>برنامه ثابت همه هفته‌ها</h4><label for="cfgAllClass">کلاس</label>' +
          classSelect("cfgAllClass", cur.all?.classId) +
          '<label for="cfgAllLesson">درس</label>' +
          lessonSelect("cfgAllLesson", cur.all?.classId, cur.all?.lessonId) +
          "</section>";
        h +=
          '<details class="week-config-exceptions" ' +
          (cur.odd || cur.even ? "open" : "") +
          '><summary>برنامه متفاوت برای هفته فرد یا زوج</summary><section class="week-config-section"><h4>هفته‌های فرد</h4><label for="cfgOddClass">کلاس</label>' +
          classSelect("cfgOddClass", cur.odd?.classId) +
          '<label for="cfgOddLesson">درس</label>' +
          lessonSelect("cfgOddLesson", cur.odd?.classId, cur.odd?.lessonId) +
          '</section><section class="week-config-section"><h4>هفته‌های زوج</h4><label for="cfgEvenClass">کلاس</label>' +
          classSelect("cfgEvenClass", cur.even?.classId) +
          '<label for="cfgEvenLesson">درس</label>' +
          lessonSelect("cfgEvenLesson", cur.even?.classId, cur.even?.lessonId) +
          '</section></details><p class="week-config-note">برنامه فرد یا زوج، در همان هفته جایگزین برنامه ثابت می‌شود. نام دبیر از مشخصات درس خوانده می‌شود.</p><div class="week-config-actions"><button onclick="saveMasterConfig(' +
          day +
          "," +
          period +
          ')">ذخیره برنامه</button><button class="ghost" onclick="closeModal()">انصراف</button><button class="danger" onclick="clearMasterConfig(' +
          day +
          "," +
          period +
          ')">پاک‌کردن این زنگ</button></div>';

        showModal(`تنظیم ${DAYS[day]} — زنگ ${period + 1}`, h);
      }

      function updateLessonOptions(classSelectId) {
        const classId = document.getElementById(classSelectId).value;
        const lessonSelectId = classSelectId.replace("Class", "Lesson");
        const sel = document.getElementById(lessonSelectId);
        if (!sel) return;
        if (!classId) {
          sel.innerHTML = '<option value="">— اول کلاس —</option>';
          return;
        }
        const cls = findClassById(classId);
        if (!cls) {
          sel.innerHTML = '<option value="">— خطا —</option>';
          return;
        }
        sel.innerHTML =
          '<option value="">— درس —</option>' +
          (cls.classObj.lessons || [])
            .map((l) => `<option value="${l.id}">${esc(l.name)}</option>`)
            .join("");
      }

      async function saveMasterConfig(day, period) {
        db.masterSchedule = db.masterSchedule || {};
        const map = {
          all: { c: "cfgAllClass", l: "cfgAllLesson" },
          odd: { c: "cfgOddClass", l: "cfgOddLesson" },
          even: { c: "cfgEvenClass", l: "cfgEvenLesson" },
        };
        Object.keys(map).forEach((k) => {
          const classId = document.getElementById(map[k].c).value;
          const lessonId = document.getElementById(map[k].l).value;
          const key = `${day}-${period}-${k}`;
          if (classId && lessonId) {
            const cls = findClassById(classId);
            if (cls)
              db.masterSchedule[key] = {
                schoolId: cls.school.id,
                classId,
                lessonId,
              };
          } else {
            delete db.masterSchedule[key];
          }
        });
        await saveDB();
        closeModal();
        render();
      }

      async function clearMasterConfig(day, period) {
        if (!confirm("کل تنظیمات این زنگ پاک شوند؟")) return;
        delete db.masterSchedule[`${day}-${period}-all`];
        delete db.masterSchedule[`${day}-${period}-odd`];
        delete db.masterSchedule[`${day}-${period}-even`];
        await saveDB();
        closeModal();
        render();
      }

      function clickMasterCell(day, period) {
        const entry = getMasterEntry(day, period, todayISO());
        if (!entry || !entry.lessonId) {
          openMasterConfig(day, period);
          return;
        }
        const cls = findClassById(entry.classId);
        if (!cls) {
          alert("کلاس/درس حذف شده. لطفاً مجدد تنظیم کنید");
          openMasterConfig(day, period);
          return;
        }

        const allClasses = [];
        db.schools.forEach((s) =>
          s.classes.forEach((c) => allClasses.push({ school: s, class: c })),
        );

        const existing = db.sessions
          .filter((s) => {
            const sd = getDayIdxFromDate(s.date);
            return (
              s.classId === entry.classId && s.period === period && sd === day
            );
          })
          .sort((a, b) => b.date.localeCompare(a.date));

        let h = `<div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:14px">
    <div style="margin-bottom:10px">
      <strong>${DAYS[day]} — زنگ ${period + 1}</strong>
    </div>

    <div class="form-row" style="margin-bottom:6px">
      <label style="min-width:60px">کلاس:</label>
      <select id="sessNewClass" style="flex:1" onchange="updateSessionLessonOptions()">
        ${allClasses.map((x) => `<option value="${x.class.id}" ${x.class.id === entry.classId ? "selected" : ""}>${esc(x.school.name)} / ${esc(x.class.name)}</option>`).join("")}
      </select>
    </div>
    <div class="form-row" style="margin-bottom:6px">
      <label style="min-width:60px">درس:</label>
      <select id="sessNewLesson" style="flex:1">
        ${(cls.classObj.lessons || []).map((l) => `<option value="${l.id}" ${l.id === entry.lessonId ? "selected" : ""}>${esc(l.name)}</option>`).join("")}
      </select>
    </div>
  </div>

  <p>📅 تاریخ جلسه را انتخاب کنید:</p>
  <div class="form-row">
    <input type="date" id="sessNewDate" value="${todayISO()}" onchange="document.getElementById('shamsiSessNew').textContent=toShamsi(this.value)" style="flex:1">
    <span class="shamsi-display" id="shamsiSessNew">${toShamsi(todayISO())}</span>
    <button onclick="startSessionFromMaster(${day},${period})">📝 ایجاد / بازکردن</button>
  </div>
  <p class="muted" style="font-size:.85em">می‌توانید کلاس و درس را به صورت دستی تغییر دهید. اگر جلسه‌ای با این تاریخ و زنگ وجود داشته باشد باز می‌شود.</p>`;

        if (existing.length) {
          h += `<h4 style="margin-top:16px">جلسات ثبت‌شده این زنگ (${existing.length}):</h4><div>`;
          existing.slice(0, 15).forEach((s) => {
            const present = Object.values(s.attendance).filter(
              (x) => x === "present",
            ).length;
            const total = Object.keys(s.attendance).length;
            h += `<div class="list-item" onclick="openExistingSession('${s.id}')">
        <div><strong>${faDate(s.date)}</strong></div>
        <div class="muted" style="font-size:.85em">${present}/${total} حاضر | ${s.scores.length} امتیاز</div></div>`;
          });
          h += `</div>`;
        }
        showModal("ثبت جلسه", h);
      }

      function updateSessionLessonOptions() {
        const classId = document.getElementById("sessNewClass").value;
        const sel = document.getElementById("sessNewLesson");
        if (!sel) return;
        const cls = findClassById(classId);
        if (!cls) return;
        sel.innerHTML = (cls.classObj.lessons || [])
          .map((l) => `<option value="${l.id}">${esc(l.name)}</option>`)
          .join("");
      }

      async function startSessionFromMaster(day, period) {
        const date = document.getElementById("sessNewDate").value;
        const classId = document.getElementById("sessNewClass").value;
        const lessonId = document.getElementById("sessNewLesson").value;

        if (!date) return alert("تاریخ را انتخاب کنید");
        if (!classId || !lessonId) return alert("کلاس و درس را انتخاب کنید");

        const dIdx = getDayIdxFromDate(date);
        if (dIdx !== day) {
          if (
            !confirm(
              `تاریخ ${faDate(date)} روز ${DAYS[dIdx]} است، نه ${DAYS[day]}. ادامه می‌دهید؟`,
            )
          )
            return;
        }

        let session = db.sessions.find(
          (s) =>
            s.classId === classId && s.date === date && s.period === period,
        );
        if (!session) {
          const cls = findClassById(classId);
          session = {
            id: uid(),
            schoolId: cls.school.id,
            classId: classId,
            date,
            period,
            lessonId: lessonId,
            poudmanId: null,
            unitId: null,
            attendance: {},
            scores: [],
            roster: snapshotRoster(cls.classObj),
          };
          db.sessions.push(session);
          await saveDB({ sessionId: session.id });
        } else if (session.lessonId !== lessonId) {
          alert(
            "این زنگ برای درس دیگری ثبت شده است؛ برای حفظ سابقه جلسه قبلی باز می‌شود.",
          );
        }
        openSessionModal(session);
      }
      function openExistingSession(id) {
        const sess = db.sessions.find((s) => s.id === id);
        if (sess) openSessionModal(sess);
      }

      async function deleteSchool(id) {
        if (!confirm("مدرسه و تمام داده‌هایش حذف شوند؟")) return;
        const school = db.schools.find((s) => s.id === id);
        const classIds = (school?.classes || []).map((c) => c.id);
        db.schools = db.schools.filter((s) => s.id !== id);
        db.sessions = db.sessions.filter((x) => x.schoolId !== id);
        Object.keys(db.masterSchedule || {}).forEach((k) => {
          const e = db.masterSchedule[k];
          if (e.schoolId === id || classIds.includes(e.classId))
            delete db.masterSchedule[k];
        });
        await saveDB();
        render();
      }
      async function deleteClass(id) {
        if (!confirm("کلاس و تمام داده‌هایش حذف شوند؟")) return;
        const s = getSchool(state.schoolId);
        s.classes = s.classes.filter((c) => c.id !== id);
        db.sessions = db.sessions.filter((x) => x.classId !== id);
        Object.keys(db.masterSchedule || {}).forEach((k) => {
          if (db.masterSchedule[k].classId === id) delete db.masterSchedule[k];
        });
        await saveDB();
        render();
      }
      function addStudent(e) {
        e.preventDefault();
        const c = getClassObj(state.schoolId, state.classId);
        if (!c) return;
        const n = e.target.name.value.trim();
        if (!n) return;
        c.students.push({ id: uid(), name: n });
        saveDB();
        e.target.reset();
        render();
      }
      async function deleteStudent(stId) {
        if (!confirm("دانش‌آموز از فهرست فعال خارج و سوابق بایگانی شود؟"))
          return;
        const c = getClassObj(state.schoolId, state.classId),
          st = getStudentObj(c, stId);
        if (st) {
          archiveStudent(c, st);
          await saveDB({ classId: c.id });
          render();
        }
      }

      async function addLesson(e) {
        e.preventDefault();
        const c = getClassObj(state.schoolId, state.classId);
        if (!c) return;
        const n = e.target.name.value.trim();
        if (!n) return;
        const teacher = e.target.teacher.value.trim();
        const periods = parseInt(e.target.periods.value) || 2;
        c.lessons.push({
          id: uid(),
          name: n,
          teacher,
          periodsPerWeek: periods,
          gradeMode: e.target.gradeMode.value,
          kardaneshScores: {},
          weightMostamar: 40,
          weightPayani: 60,
          applyPosNegToFinal: false,
          poudmans:
            e.target.gradeMode.value === "kardanesh"
              ? []
              : makeDefaultPoudmans(),
        });
        await saveDB({ classId: c.id });
        e.target.reset();
        render();
      }
      async function deleteLesson(id) {
        if (!confirm("درس و تمام نمراتش حذف شوند؟")) return;
        const c = getClassObj(state.schoolId, state.classId);
        c.lessons = c.lessons.filter((l) => l.id !== id);
        db.sessions = db.sessions.filter((x) => x.lessonId !== id);
        Object.keys(db.masterSchedule || {}).forEach((k) => {
          if (db.masterSchedule[k].lessonId === id) delete db.masterSchedule[k];
        });
        await saveDB({ action: "حذف درس و جلسات مرتبط" });
        render();
      }

      function openTransferModal(stId) {
        const c = getClassObj(state.schoolId, state.classId);
        const student = getStudentObj(c, stId);
        if (!student) return;
        let h = `<p>دانش‌آموز: <strong>${esc(student.name)}</strong></p>
    <div class="form-row"><label>کلاس مقصد:</label><select id="transferTarget" style="flex:1">`;
        let hasTarget = false;
        db.schools.forEach((s) =>
          s.classes.forEach((cl) => {
            if (cl.id === c.id) return;
            hasTarget = true;
            h += `<option value="${cl.id}">${esc(s.name)} → ${esc(cl.name)}</option>`;
          }),
        );
        h += `</select></div>`;
        if (!hasTarget)
          h += `<p class="muted">کلاس دیگری وجود ندارد</p><button onclick="closeModal()">بستن</button>`;
        else
          h += `<div class="row" style="justify-content:flex-end">
    <button class="ghost" onclick="closeModal()">انصراف</button>
    <button class="ghost" onclick="doTransfer('${stId}',true)">📋 کپی</button>
    <button onclick="doTransfer('${stId}',false)">📤 انتقال</button></div>`;
        showModal("انتقال/کپی دانش‌آموز", h);
      }
      async function doTransfer(stId, isCopy) {
        const targetId = document.getElementById("transferTarget").value;
        const srcC = getClassObj(state.schoolId, state.classId);
        const student = srcC.students.find((s) => s.id === stId);
        if (!student || !targetId) return;
        let targetC = null;
        for (const s of db.schools) {
          const t = s.classes.find((c) => c.id === targetId);
          if (t) {
            targetC = t;
            break;
          }
        }
        if (!targetC) return;
        if (student.code && knownStudentCode(targetC, student.code, student.id))
          return alert("کد دانش‌آموز در مقصد تکراری است.");
        if (isCopy)
          targetC.students.push({
            id: uid(),
            name: student.name,
            ...(student.code ? { code: student.code } : {}),
          });
        else {
          if (targetC.students.some((s) => s.id === student.id))
            return alert("دانش‌آموز در مقصد وجود دارد.");
          targetC.archivedStudents = (targetC.archivedStudents || []).filter(
            (s) => s.id !== student.id,
          );
          targetC.students.push({
            id: student.id,
            name: student.name,
            ...(student.code ? { code: student.code } : {}),
          });
          archiveStudent(srcC, student);
        }
        await saveDB();
        closeModal();
        render();
      }

      function openLessonConfig(lId) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lId);
        if (!lesson) return;
        let h = `<div class="form-row"><label>نام درس:</label><input id="cfgName" value="${esc(lesson.name)}" style="flex:1"></div>
    <div class="form-row"><label>نام دبیر:</label><input id="cfgTeacher" value="${esc(lesson.teacher || "")}" placeholder="مثلاً آقای احمدی" style="flex:1"></div>
    <div class="form-row"><label>گروه درسی:</label><select id="cfgGradeMode" onchange="document.getElementById('cfgTechnical').hidden=this.value==='kardanesh';document.getElementById('cfgKardanesh').hidden=this.value!=='kardanesh'"><option value="standard" ${lesson.gradeMode !== "kardanesh" ? "selected" : ""}>فنی (پودمانی)</option><option value="kardanesh" ${lesson.gradeMode === "kardanesh" ? "selected" : ""}>کاردانش (تئوری و عملی)</option></select></div>
    <p class="muted">تغییر نوع، نمرات قبلی را تبدیل نمی‌کند؛ سوابق هر روش جداگانه حفظ می‌شوند. تنظیمات پودمان و وزن‌های مستمر و پایانی مخصوص گروه فنی هستند.</p>
    <div class="form-row"><label>زنگ/هفته:</label><input id="cfgPeriods" type="number" min="1" max="10" value="${lesson.periodsPerWeek || 2}" style="width:100px"></div>
    <p id="cfgKardanesh" ${lesson.gradeMode === "kardanesh" ? "" : "hidden"}>کاردانش: تئوری ۳۰٪، عملی ۷۰٪؛ نمره نهایی خودکار و حد قبولی ۱۴. ثبت نمرات از بخش نمرات درس انجام می‌شود.</p><div id="cfgTechnical" ${lesson.gradeMode === "kardanesh" ? "hidden" : ""}><div class="form-row"><label>وزن مستمر (%):</label><input id="cfgWeightM" type="number" min="0" max="100" value="${lesson.weightMostamar ?? 40}" style="width:90px">
    <label>وزن پایانی (%):</label><input id="cfgWeightP" type="number" min="0" max="100" value="${lesson.weightPayani ?? 60}" style="width:90px"></div>
    <h4>پودمان‌ها و واحدها</h4>`;
        (lesson.poudmans.length
          ? lesson.poudmans
          : makeDefaultPoudmans()
        ).forEach((p, pi) => {
          h += `<div style="margin:10px 0;padding:10px;background:#f8fafc;border-radius:8px">
      <div class="form-row"><label>پودمان ${pi + 1}:</label><input class="cfgPname" data-pi="${pi}" value="${esc(p.name)}" style="flex:1"></div>`;
          p.units.forEach((u, ui) => {
            h += `<div class="form-row" style="margin-right:20px"><label>واحد ${ui + 1}:</label>
        <input class="cfgUname" data-pi="${pi}" data-ui="${ui}" value="${esc(u.name)}" style="flex:1"></div>`;
          });
          h += `</div>`;
        });
        h += `</div><div class="row" style="justify-content:flex-end;margin-top:14px">
    <button class="ghost" onclick="closeModal()">انصراف</button>
    <button onclick="saveLessonConfig('${lId}')">💾 ذخیره</button></div>`;
        showModal("تنظیمات درس", h);
      }
      async function saveLessonConfig(lId) {
        const c = getClassObj(state.schoolId, state.classId);
        const lesson = getLessonObj(c, lId);
        const mode = document.getElementById("cfgGradeMode").value;
        const wm = Number(document.getElementById("cfgWeightM").value),
          wp = Number(document.getElementById("cfgWeightP").value),
          periods = Number(document.getElementById("cfgPeriods").value);
        if (!Number.isInteger(periods) || periods < 1 || periods > 10)
          return alert("زنگ هفتگی باید ۱ تا ۱۰ باشد.");
        if (
          !Number.isFinite(wm) ||
          !Number.isFinite(wp) ||
          wm < 0 ||
          wp < 0 ||
          wm > 100 ||
          wp > 100 ||
          (mode === "standard" && wm + wp !== 100)
        )
          return alert(
            "وزن‌ها باید صفر تا صد و مجموع وزن‌های مستمر و پایانی صد باشد.",
          );
        if (
          mode !== (lesson.gradeMode || "standard") &&
          !confirm(
            "نوع نمره‌دهی تغییر کند؟ سوابق تبدیل نمی‌شوند و جداگانه حفظ می‌شوند.",
          )
        )
          return;
        if (mode === "standard" && !lesson.poudmans.length)
          lesson.poudmans = makeDefaultPoudmans();
        lesson.gradeMode = mode;
        lesson.name =
          document.getElementById("cfgName").value.trim() || lesson.name;
        lesson.teacher = document.getElementById("cfgTeacher").value.trim();
        lesson.periodsPerWeek =
          parseInt(document.getElementById("cfgPeriods").value) || 2;
        lesson.weightMostamar = wm;
        lesson.weightPayani = wp;
        document
          .querySelectorAll(
            mode === "standard" ? ".cfgPname" : ".no-course-fields",
          )
          .forEach(
            (i) => (lesson.poudmans[+i.dataset.pi].name = i.value.trim()),
          );
        document
          .querySelectorAll(
            mode === "standard" ? ".cfgUname" : ".no-course-fields",
          )
          .forEach(
            (i) =>
              (lesson.poudmans[+i.dataset.pi].units[+i.dataset.ui].name =
                i.value.trim()),
          );
        await saveDB({ classId: c.id });
        closeModal();
        render();
      }

      function showSessionPanel(panel) {
        if (!["attendance", "activity"].includes(panel)) return;
        const root = document.querySelector("#modalBody .session-workspace");
        if (!root) return;
        for (const section of root.querySelectorAll("[data-session-panel]"))
          section.hidden = section.dataset.sessionPanel !== panel;
        for (const button of root.querySelectorAll("[data-session-tab]"))
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.sessionTab === panel),
          );
      }
      function openSessionModal(session) {
        const selectedPanel =
          !document.getElementById("modal").classList.contains("hidden") &&
          currentSessionId === session.id
            ? document.querySelector(
                "#modalBody [data-session-tab][aria-pressed=true]",
              )?.dataset.sessionTab
            : null;
        currentSessionId = session.id;
        const c = getClassObj(session.schoolId, session.classId);
        if (!c) {
          closeModal();
          return;
        }
        const lesson = getLessonObj(c, session.lessonId);
        if (!lesson) {
          closeModal();
          return;
        }
        const dIdx = getDayIdxFromDate(session.date);
        const school = getSchool(session.schoolId);
        let h = `<div class="session-workspace"><div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:14px">
    <span class="badge" style="background:${getClassColor(session.classId)};color:#fff">${esc(school?.name || "")} / ${esc(c.name)}</span>
    <strong style="margin-right:8px">${esc(lesson.name)}</strong>${lesson.teacher ? ` — دبیر: ${esc(lesson.teacher)}` : ""} — ${DAYS[dIdx]} — زنگ ${session.period + 1}
  </div>`;
        h += `<details class="session-date-tools"><summary>تاریخ جلسه: ${esc(faDate(session.date))}</summary><div class="form-row">
    <label>📅 تاریخ جلسه:</label>
    <input type="date" id="sessDate" value="${session.date}" onchange="document.getElementById('shamsiSessDate').textContent=toShamsi(this.value)" style="flex:1">
    <span class="shamsi-display" id="shamsiSessDate">${toShamsi(session.date)}</span>
    <button class="ghost" onclick="changeSessionDate('${session.id}')" style="font-size:.85em">اعمال تغییر تاریخ</button>
  </div></details>`;
        if (lesson.gradeMode !== "kardanesh")
          h += `<div class="form-row">
    <label>پودمان:</label>
    <select id="sessPoudman" onchange="updateSessionUnits()">
      <option value="">— انتخاب —</option>
      ${lesson.poudmans.map((p) => `<option value="${p.id}" ${p.id === session.poudmanId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
    <label>واحد:</label>
    <select id="sessUnit" onchange="saveSessionUnit()">
      <option value="">— انتخاب —</option>
      ${(lesson.poudmans.find((p) => p.id === session.poudmanId)?.units || []).map((u) => `<option value="${u.id}" ${u.id === session.unitId ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
    </select>
  </div>`;
        h += `<div class="session-mode-picker"><button type="button" aria-pressed="true" data-session-tab="attendance" onclick="showSessionPanel(\'attendance\')">حضور و غیاب</button><button type="button" aria-pressed="false" data-session-tab="activity" onclick="showSessionPanel(\'activity\')">نمره و فعالیت</button></div><section data-session-panel="attendance"><div class="row" style="justify-content:space-between;align-items:center;margin-top:14px">
    <h4 style="margin:0">👥 حضور و غیاب</h4>
    <div>
      <button type="button" class="success" onclick="setAllAttendance('present')" style="font-size:.8em;padding:4px 10px">✅ همه حاضر</button>
      <button type="button" class="danger" onclick="setAllAttendance('absent')" style="font-size:.8em;padding:4px 10px">❌ همه غایب</button>
    </div>
  </div><div>`;
        if (!c.students.length) h += `<div class="empty">دانش‌آموزی نیست</div>`;
        const sortedStudents = getSortedStudents({
          students: sessionStudents(c, session),
        });
        sortedStudents.forEach((s, i) => {
          const st = session.attendance[s.id] || "";
          const isPresent = st === "present";
          const isAbsent = st === "absent";
          const isLate = st.startsWith("late");
          const lateMins =
            isLate && st.includes(":") ? Number(st.split(":")[1]) : "";
          h += `<div class="att-row">
      <div class="att-name">${i + 1}. ${esc(s.name)}</div>
      <div class="att-btns" data-sid="${s.id}">
        <button type="button" class="present ${isPresent ? "active" : ""}" onclick="toggleAtt(this,'present')">حاضر</button>
        <button type="button" class="late ${isLate ? "active" : ""}" onclick="toggleAtt(this,'late')">تأخیر ${isLate && lateMins ? `(${lateMins}د)` : ""}</button>
        <button type="button" class="absent ${isAbsent ? "active" : ""}" onclick="toggleAtt(this,'absent')">غایب</button>
      </div>
    </div>`;
        });
        h += `</div></section><section data-session-panel="activity" hidden><h4>ثبت نمره کلاسی، مثبت، منفی یا تکلیف</h4><p class="muted">نمرات رسمی عملی، تئوری یا پودمان در بخش نمرات درس ثبت می‌شوند.</p>
    <form onsubmit="addSessionScore(event,'${session.id}')" class="row session-entry-form">
      <select name="studentId" aria-label="دانش‌آموز" required style="flex:1"><option value="">دانش‌آموز</option>
      ${getSortedStudents({ students: sessionStudents(c, session) })
        .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`)
        .join("")}</select>
      <select name="type" aria-label="نوع فعالیت" required>
        ${!lesson.gradingPolicy && lesson.gradeMode !== "kardanesh" ? `<option value="mostamar">مستمر</option><option value="payani">پایانی</option>` : ""}
        <option value="classGrade">نمره کلاسی (۰ تا ۲۰)</option><option value="activity">امتیاز فعالیت</option><option value="positive">مثبت</option><option value="negative">منفی</option>
        <option value="homework">تکلیف</option>
      </select>
      <input name="value" aria-label="مقدار" type="text" inputmode="decimal" placeholder="مقدار" required style="width:80px">
      <input name="note" aria-label="توضیح فعالیت" placeholder="توضیح (اختیاری)" style="flex:1">
      <button type="submit">ثبت فعالیت</button>
    </form><div>`;
        if (!session.scores.length)
          h += `<div class="empty">امتیازی ثبت نشده</div>`;
        else {
          h += `<table class="karnameh-table"><thead><tr><th>دانش‌آموز</th><th>نوع</th><th>مقدار</th><th>توضیح</th><th></th></tr></thead><tbody>`;
          session.scores.forEach((sc, idx) => {
            const st = sessionStudent(c, session, sc.studentId);
            h += `<tr><td>${esc(st ? st.name : "—")}</td>
        <td><span class="badge ${sc.type}">${TYPE_LABELS[sc.type]}</span></td>
        <td>${sc.value}</td><td>${esc(sc.note || "")}</td>
        <td><button type="button" class="danger" onclick="removeSessionScore('${session.id}',${idx})">×</button></td></tr>`;
          });
          h += `</tbody></table>`;
        }
        h += `</div></section><div class="row" style="justify-content:flex-end;margin-top:14px">
    <button type="button" class="success" onclick="copyToClipboard(generateSessionReportText(getSessionById('${session.id}'),getClassObj('${session.schoolId}','${session.classId}'),getLessonObj(getClassObj('${session.schoolId}','${session.classId}'),'${session.lessonId}')),this)">📋 کپی متن برای معاون</button>
    <button type="button" onclick="closeModal()">بستن</button></div></div>`;
        showModal("ثبت اطلاعات جلسه", h);
        if (selectedPanel) showSessionPanel(selectedPanel);
      }

      function getSessionById(id) {
        return db.sessions.find((s) => s.id === id);
      }

      function setAllAttendance(status) {
        const sess = db.sessions.find((s) => s.id === currentSessionId);
        if (!sess) return;
        const c = getClassObj(sess.schoolId, sess.classId);
        if (!c) return;
        c.students.forEach((s) => {
          sess.attendance[s.id] = status;
        });
        saveDB();
        document.querySelectorAll(".att-btns").forEach((wrap) => {
          wrap.querySelectorAll("button").forEach((b) => {
            b.classList.remove("active");
            b.innerHTML = b.innerHTML.replace(/\s\(\d+د\)/, "");
            if (b.classList.contains(status)) b.classList.add("active");
          });
        });
      }

      async function toggleAtt(btn, status) {
        const wrap = btn.parentElement;
        const was = btn.classList.contains("active");
        const sess = db.sessions.find((s) => s.id === currentSessionId);
        if (!sess) return;
        const sid = wrap.dataset.sid;
        wrap.querySelectorAll("button").forEach((b) => {
          b.classList.remove("active");
          if (b.classList.contains("late")) b.innerHTML = "تأخیر";
          else if (b.classList.contains("present")) b.innerHTML = "حاضر";
          else if (b.classList.contains("absent")) b.innerHTML = "غایب";
        });
        if (!was) {
          btn.classList.add("active");
          if (status === "late") {
            const mins = prompt("دقیقه تأخیر: عدد صحیح صفر تا ۹۹۹", "10");
            if (mins === null) {
              openSessionModal(sess);
              return;
            }
            if (!/^\d{1,3}$/.test(mins.trim())) {
              alert("دقیقه نامعتبر است.");
              openSessionModal(sess);
              return;
            }
            if (mins !== null && mins.trim() !== "") {
              sess.attendance[sid] = "late:" + Number(mins);
              btn.textContent = `تأخیر (${Number(mins)}د)`;
            } else {
              sess.attendance[sid] = "late:0";
            }
          } else {
            sess.attendance[sid] = status;
          }
        } else {
          delete sess.attendance[sid];
        }
        await saveDB({ sessionId: sess.id });
      }

      async function changeSessionDate(sessionId) {
        const sess = db.sessions.find((s) => s.id === sessionId);
        if (!sess) return;
        const newDate = document.getElementById("sessDate").value;
        if (!newDate) return alert("تاریخ معتبر نیست");
        if (newDate === sess.date) return;
        const conflict = db.sessions.find(
          (s) =>
            s.id !== sessionId &&
            s.classId === sess.classId &&
            s.date === newDate &&
            s.period === sess.period,
        );
        if (conflict) {
          if (confirm("برای این تاریخ و زنگ جلسه‌ای ثبت شده. آن را باز کنیم؟"))
            openSessionModal(conflict);
          return;
        }
        sess.date = newDate;
        await saveDB({ sessionId: sess.id });
        openSessionModal(sess);
      }
      function updateSessionUnits() {
        const sess = db.sessions.find((s) => s.id === currentSessionId);
        if (!sess) return;
        sess.poudmanId = document.getElementById("sessPoudman").value || null;
        sess.unitId = null;
        saveDB();
        const c = getClassObj(sess.schoolId, sess.classId);
        const lesson = getLessonObj(c, sess.lessonId);
        const p = lesson.poudmans.find((x) => x.id === sess.poudmanId);
        document.getElementById("sessUnit").innerHTML =
          '<option value="">— انتخاب —</option>' +
          (p
            ? p.units
                .map((u) => `<option value="${u.id}">${esc(u.name)}</option>`)
                .join("")
            : "");
      }
      function saveSessionUnit() {
        const sess = db.sessions.find((s) => s.id === currentSessionId);
        if (!sess) return;
        sess.unitId = document.getElementById("sessUnit").value || null;
        saveDB();
      }
      function addSessionScore(e, sessionId) {
        e.preventDefault();
        const sess = db.sessions.find((s) => s.id === sessionId);
        if (!sess) return;
        const f = e.target,
          val = parseFloat(f.value.value);
        if (!Number.isFinite(val) || val < 0)
          return alert("مقدار باید عدد نامنفی باشد.");
        if (!Object.hasOwn(TYPE_LABELS, f.type.value))
          return alert("نوع نامعتبر است.");
        const c = getClassObj(sess.schoolId, sess.classId),
          l = getLessonObj(c, sess.lessonId);
        if (!c.students.some((st) => st.id === f.studentId.value))
          return alert("دانش‌آموز نامعتبر است.");
        if (["mostamar", "payani"].includes(f.type.value)) {
          if (l.gradeMode === "kardanesh")
            return alert("عملی و تئوری را در بخش نمرات کاردانش ثبت کنید.");
          if (val > 20) return alert("نمره باید بین صفر و بیست باشد.");
          if (!sess.poudmanId || !sess.unitId)
            return alert("ابتدا پودمان و واحد را انتخاب کنید.");
          const old = sess.scores.find(
            (sc) =>
              sc.studentId === f.studentId.value && sc.type === f.type.value,
          );
          if (old) {
            old.value = val;
            old.note = f.note.value.trim();
            saveDB();
            openSessionModal(getSessionById(sessionId));
            return;
          }
        }
        sess.scores.push({
          studentId: f.studentId.value,
          type: f.type.value,
          value: val,
          note: f.note.value.trim(),
        });
        saveDB();
        openSessionModal(sess);
      }
      async function removeSessionScore(sessionId, idx) {
        const sess = db.sessions.find((s) => s.id === sessionId);
        if (!sess) return;
        sess.scores.splice(idx, 1);
        await saveDB({ sessionId: sess.id });
        openSessionModal(sess);
      }

      async function exportBackup() {
        const data = { version: 23, exportedAt: new Date().toISOString(), db };
        const jsonString = JSON.stringify(data, null, 2);
        const fileName = `پشتیبان-مدرسه-${todayISO()}.json`;
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: fileName,
              types: [
                {
                  description: "فایل JSON",
                  accept: { "application/json": [".json"] },
                },
              ],
            });
            const writable = await handle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            alert("✅ پشتیبان با موفقیت ذخیره شد.");
            return;
          } catch (err) {
            if (err.name === "AbortError") return;
          }
        }
        const blob = new Blob([jsonString], { type: "application/json" });
        downloadLocalFile(blob, fileName);
      }

      function handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
          e.target.value = "";
          return alert("حداکثر حجم فایل ۲۰ مگابایت است.");
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const parsed = JSON.parse(ev.target.result);
            if (
              parsed.version !== undefined &&
              (!Number.isInteger(parsed.version) || parsed.version > 23)
            )
              throw Error("نسخه پشتیبان پشتیبانی نمی‌شود.");
            const candidate = prepareDB(parsed.db || parsed);
            if (
              !confirm(
                "پشتیبان معتبر جایگزین شود؟ نسخه قبلی برای بازیابی نگه داشته می‌شود.",
              )
            )
              return;
            const old = localStorage.getItem(STORAGE_KEY);
            if (old !== null)
              localStorage.setItem(STORAGE_KEY + "_beforeImport", old);
            const raw = JSON.stringify(candidate);
            localStorage.setItem(STORAGE_KEY, raw);
            db = candidate;
            storageSnapshot = raw;
            storageBlocked = false;
            storageProblem = "";
            isAuthenticated = false;
            state = {
              view: "schools",
              schoolId: null,
              classId: null,
              lessonId: null,
              tab: "students",
              masterFilter: null,
              reportTab: "comprehensive",
            };
            lessonReportFilter = { schoolId: "", classId: "", lessonId: "" };
            karnamehFilter = { schoolId: "", classId: "", studentId: "" };
            resetGlobalFilters();
            render();
            alert("بازیابی انجام شد.");
          } catch (err) {
            alert("بازیابی انجام نشد: " + err.message);
          } finally {
            e.target.value = "";
          }
        };
        reader.onerror = () => {
          e.target.value = "";
          alert("خواندن فایل انجام نشد.");
        };
        reader.readAsText(file, "UTF-8");
      }

      function wipeAllData() {
        const t1 = confirm(
          "⚠️ آیا از پاک کردن کامل تمام داده‌ها مطمئن هستید؟ این عمل غیرقابل بازگشت است.",
        );
        if (!t1) return;
        const t2 = confirm(
          "🚨 آخرین هشدار: تمام مدارس، کلاس‌ها، دانش‌آموزان، نمرات و برنامه هفتگی برای همیشه حذف می‌شوند. ادامه می‌دهید؟",
        );
        if (!t2) return;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY + "_beforeImport");
        storageSnapshot = null;
        storageBlocked = false;
        storageProblem = "";
        db = defaultDB();
        isAuthenticated = false;
        state = {
          view: "schools",
          schoolId: null,
          classId: null,
          lessonId: null,
          tab: "students",
          masterFilter: null,
          reportTab: "comprehensive",
        };
        globalFilter = {
          schoolId: "",
          classId: "",
          lessonId: "",
          studentId: "",
          period: "",
          date: "",
          showAttendance: true,
          showScores: true,
          showPosNeg: true,
          showHomework: true,
          reportMode: "detailed",
          showPresentNames: true,
          showAbsentNames: true,
          showLateNames: true,
        };
        lessonReportFilter = { schoolId: "", classId: "", lessonId: "" };
        karnamehFilter = { schoolId: "", classId: "", studentId: "" };
        render();
        alert("✅ تمام داده‌ها با موفقیت حذف شدند.");
      }

      function prepareDB(input) {
        const d = JSON.parse(JSON.stringify(input));
        validateDB(d);
        const result = Object.assign(defaultDB(), d);
        result.settings = Object.assign(defaultDB().settings, d.settings || {});
        result.schemaVersion = 23;
        migrateToMaster(result);
        migrateUnitScores(result);
        result.schools.forEach((s) =>
          s.classes.forEach((c) => {
            c.archivedStudents = c.archivedStudents || [];
            c.lessons = c.lessons || [];
            c.lessons.forEach((l) => {
              l.gradeMode = l.gradeMode || "standard";
              if (
                l.gradingPolicy &&
                ["dual", "modular"].includes(l.gradingPolicy.method)
              ) {
                const expected =
                  l.gradingPolicy.method === "dual" ? "kardanesh" : "fani";
                if (l.gradingPolicy.branch !== expected) {
                  l.gradingPolicy.branch = expected;
                  if (l.courseInfo) l.courseInfo.branch = expected;
                  warnings.push(
                    "شاخه درس «" +
                      l.name +
                      "» با روش ثبت‌شده آن هماهنگ شد؛ قواعد را بررسی کنید.",
                  );
                }
              }
              l.kardaneshScores = l.kardaneshScores || {};
              l.weightMostamar = l.weightMostamar ?? 40;
              l.weightPayani = l.weightPayani ?? 60;
              for (const g of Object.values(l.kardaneshScores)) {
                g.final =
                  g.practical != null && g.theory != null
                    ? (g.practical * 7 + g.theory * 3) / 10
                    : null;
                g.passed = g.final === null ? null : g.final >= 14;
              }
            });
          }),
        );
        return result;
      }

      function validateDB(d) {
        const fail = (m) => {
            throw Error("ساختار نامعتبر: " + m);
          },
          obj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
        const arr = (x, m) => {
            if (!Array.isArray(x)) fail(m);
          },
          id = (x) => {
            if (!isSafeRecordId(x)) fail("شناسه");
          },
          text = (x) => {
            if (typeof x !== "string" || x.length > 10000) fail("متن");
          };
        const score = (x) => {
          if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 20)
            fail("نمره صفر تا بیست");
        };
        const date = (x) => {
          if (
            typeof x !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(x) ||
            !Number.isFinite(Date.parse(x + "T00:00:00Z")) ||
            new Date(x + "T00:00:00Z").toISOString().slice(0, 10) !== x
          )
            fail("تاریخ");
        };
        if (!obj(d)) fail("بانک");
        assertSafeDataTree(d);
        arr(d.schools, "مدارس");
        arr(d.sessions, "جلسات");
        const classes = new Map(),
          lessons = new Map(),
          unique = new Set();
        const uid = (x) => {
          id(x);
          if (unique.has(x)) fail("شناسه تکراری");
          unique.add(x);
        };
        d.schools.forEach((s) => {
          uid(s.id);
          text(s.name);
          arr(s.classes, "کلاس‌ها");
          s.classes.forEach((c) => {
            uid(c.id);
            text(c.name);
            arr(c.students, "دانش‌آموزان");
            arr(c.archivedStudents || [], "بایگانی");
            arr(c.lessons || [], "دروس");
            classes.set(c.id, { schoolId: s.id, c });
            const studentIds = new Set();
            [...c.students, ...(c.archivedStudents || [])].forEach((st) => {
              id(st.id);
              text(st.name);
              if (studentIds.has(st.id)) fail("دانش‌آموز تکراری");
              studentIds.add(st.id);
            });
            (c.lessons || []).forEach((l) => {
              uid(l.id);
              text(l.name);
              if (l.teacher !== undefined) text(l.teacher);
              if (
                l.gradeMode &&
                !["standard", "kardanesh"].includes(l.gradeMode)
              )
                fail("نوع درس");
              for (const k of ["weightMostamar", "weightPayani"])
                if (
                  l[k] !== undefined &&
                  (!Number.isFinite(l[k]) || l[k] < 0 || l[k] > 100)
                )
                  fail("وزن");
              if (
                (l.gradeMode || "standard") === "standard" &&
                (l.weightMostamar ?? 40) + (l.weightPayani ?? 60) !== 100
              )
                fail("مجموع وزن‌ها صد نیست");
              arr(l.poudmans, "پودمان");
              const units = new Map(),
                pids = new Set();
              l.poudmans.forEach((p) => {
                uid(p.id);
                pids.add(p.id);
                text(p.name);
                arr(p.units, "واحد");
                p.units.forEach((u) => {
                  uid(u.id);
                  units.set(u.id, p.id);
                  text(u.name);
                  if (u.applyOptions !== undefined) {
                    if (
                      !obj(u.applyOptions) ||
                      Object.values(u.applyOptions).some(
                        (v) => typeof v !== "boolean",
                      )
                    )
                      fail("گزینه امتیاز");
                  }
                  if (u.unitScores !== undefined) {
                    if (!obj(u.unitScores)) fail("نمرات واحد");
                    for (const [sid, g] of Object.entries(u.unitScores)) {
                      id(sid);
                      if (!obj(g)) fail("نمره واحد");
                      for (const k of ["m", "p"]) if (g[k] != null) score(g[k]);
                    }
                  }
                });
              });
              if (l.kardaneshScores !== undefined) {
                if (!obj(l.kardaneshScores)) fail("کاردانش");
                for (const [sid, g] of Object.entries(l.kardaneshScores)) {
                  id(sid);
                  if (!obj(g)) fail("نمره کاردانش");
                  for (const k of [
                    "practical",
                    "theory",
                    "midtermPractical",
                    "midtermTheory",
                  ])
                    if (g[k] != null) score(g[k]);
                }
              }
              lessons.set(l.id, { classId: c.id, units, pids });
            });
          });
        });
        const slots = new Set();
        d.sessions.forEach((x) => {
          uid(x.id);
          const c = classes.get(x.classId),
            l = lessons.get(x.lessonId);
          if (!c || c.schoolId !== x.schoolId || !l || l.classId !== x.classId)
            fail("ارتباط جلسه");
          date(x.date);
          if (!Number.isInteger(x.period) || x.period < 0 || x.period > 11)
            fail("زنگ");
          const slot = x.classId + "|" + x.date + "|" + x.period;
          if (slots.has(slot)) fail("جلسه تکراری");
          slots.add(slot);
          if (x.poudmanId && !l.pids.has(x.poudmanId)) fail("پودمان جلسه");
          if (x.unitId && l.units.get(x.unitId) !== x.poudmanId)
            fail("واحد جلسه");
          if (!obj(x.attendance)) fail("حضور");
          for (const [sid, status] of Object.entries(x.attendance)) {
            id(sid);
            if (
              typeof status !== "string" ||
              !/^(present|absent|late(?::\d{1,3})?)$/.test(status)
            )
              fail("وضعیت حضور");
          }
          arr(x.scores, "امتیازات");
          x.scores.forEach((sc) => {
            id(sc.studentId);
            if (
              !Object.hasOwn(TYPE_LABELS, sc.type) ||
              !Number.isFinite(sc.value) ||
              sc.value < 0
            )
              fail("امتیاز");
            if (["mostamar", "payani", "classGrade"].includes(sc.type))
              score(sc.value);
            if (sc.note !== undefined) text(sc.note);
          });
          if (x.roster !== undefined) {
            arr(x.roster, "فهرست جلسه");
            const rosterIds = new Set();
            x.roster.forEach((st) => {
              id(st.id);
              text(st.name);
              if (rosterIds.has(st.id)) fail("فهرست تکراری");
              rosterIds.add(st.id);
            });
          }
        });
        if (d.settings !== undefined) {
          if (!obj(d.settings)) fail("تنظیمات");
          if (d.settings.password !== undefined) text(d.settings.password);
          if (d.settings.weekStartDate) date(d.settings.weekStartDate);
        }
        if (
          d.periods !== undefined &&
          (!Number.isInteger(d.periods) || d.periods < 1 || d.periods > 12)
        )
          fail("تعداد زنگ");
        if (d.activeDays !== undefined) {
          arr(d.activeDays, "روزها");
          if (
            new Set(d.activeDays).size !== d.activeDays.length ||
            d.activeDays.some((x) => !Number.isInteger(x) || x < 0 || x > 6)
          )
            fail("روز");
        }
        if (d.masterSchedule !== undefined) {
          if (!obj(d.masterSchedule)) fail("برنامه");
          for (const [key, e] of Object.entries(d.masterSchedule)) {
            if (!/^[0-6]-(?:[0-9]|1[01])-(all|odd|even)$/.test(key) || !obj(e))
              fail("خانه برنامه");
            const c = classes.get(e.classId),
              l = lessons.get(e.lessonId);
            if (
              !c ||
              c.schoolId !== e.schoolId ||
              !l ||
              l.classId !== e.classId
            )
              fail("ارتباط برنامه");
          }
        }
      }

      function downloadRawRecovery() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return alert("نسخه خامی وجود ندارد.");
        downloadLocalFile(
          new Blob([raw], { type: "application/json" }),
          "school-raw-recovery.json",
        );
      }

      function snapshotRoster(c) {
        return c.students.map((st) => ({
          id: st.id,
          name: st.name,
          code: st.code || "",
        }));
      }

      function sessionStudents(c, x) {
        return x.roster || [...c.students, ...(c.archivedStudents || [])];
      }

      function validateReportNotes(value, workspaceId) {
        if (value === undefined) return {};
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw Error("بخش توضیحات گزارش در پشتیبان معتبر نیست.");
        for (const [key, text] of Object.entries(value))
          if (
            typeof text !== "string" ||
            !key.startsWith(workspaceId + "|") ||
            key.split("|").length !== 7
          )
            throw Error("توضیحات گزارش با دوره پشتیبان سازگار نیست.");
        return Object.fromEntries(Object.entries(value));
      }
      function historicalRoster(c, session) {
        const recorded = new Set([
          ...Object.keys(session.attendance || {}),
          ...(session.scores || []).map((score) => score.studentId),
        ]);
        if (!recorded.size) return snapshotRoster(c);
        const known = new Map(
          [...c.students, ...(c.archivedStudents || [])].map((student) => [
            student.id,
            student,
          ]),
        );
        return [...recorded].map((id) => {
          const student = known.get(id);
          if (!student)
            throw Error("عضو ثبت‌شده در جلسه، در سوابق کلاس وجود ندارد: " + id);
          return structuredClone(student);
        });
      }

      function archiveStudent(c, st) {
        db.sessions
          .filter((x) => x.classId === c.id)
          .forEach((x) => {
            if (!x.roster) x.roster = historicalRoster(c, x);
          });
        (c.archivedStudents || (c.archivedStudents = [])).push({ ...st });
        c.students = c.students.filter((x) => x.id !== st.id);
      }

      function calcStudentLesson(c, lesson, stId, source = db) {
        const r = calcStudentLessonBase(c, lesson, stId, source);
        if (lesson.gradeMode !== "kardanesh") return r;
        const g = ownScoreRecord(lesson.kardaneshScores, stId);
        r.practical = g.practical ?? null;
        r.theory = g.theory ?? null;
        r.avgM = r.theory;
        r.avgP = r.practical;
        r.final =
          r.practical !== null && r.theory !== null
            ? (r.practical * 7 + r.theory * 3) / 10
            : null;
        r.passed = r.final === null ? null : r.final >= 14;
        return r;
      }

      function gradeStatus(r) {
        return r.final === null ? "ناقص" : r.passed ? "قبول" : "مردود";
      }

      function buildKardaneshSummaryHtml(c, l, studentId) {
        return (
          '<div class="card"><h3>کاردانش — ' +
          esc(l.name) +
          '</h3><p>نهایی = عملی × ۷۰٪ + تئوری × ۳۰٪؛ قبولی از ۱۴. هر دو نمره الزامی است.</p><div style="overflow-x:auto"><table><thead><tr><th>دانش‌آموز</th><th>عملی</th><th>تئوری</th><th>نهایی</th><th>وضعیت</th></tr></thead><tbody>' +
          getSortedStudents(
            studentId
              ? { students: [...c.students, ...(c.archivedStudents || [])] }
              : c,
          )
            .filter((st) => !studentId || st.id === studentId)
            .map((st) => {
              const r = calcStudentLesson(c, l, st.id);
              return (
                "<tr><td>" +
                esc(st.name) +
                "</td><td>" +
                (r.practical ?? "—") +
                "</td><td>" +
                (r.theory ?? "—") +
                "</td><td>" +
                (r.final === null ? "—" : r.final.toFixed(2)) +
                "</td><td>" +
                gradeStatus(r) +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div></div>"
        );
      }

      function buildKardaneshGradesHtml(c, l) {
        return (
          '<div class="card"><h3>ثبت نمرات کاردانش — ' +
          esc(l.name) +
          '</h3><p>نمره نهایی = عملی × ۷۰٪ + تئوری × ۳۰٪؛ قبولی از ۱۴. حضور و امتیازها این فرمول را تغییر نمی‌دهند. نهایی خودکار ذخیره می‌شود.</p><div style="overflow-x:auto"><table><thead><tr><th>دانش‌آموز</th><th>عملی (۷۰٪)</th><th>تئوری (۳۰٪)</th><th>نهایی</th><th>وضعیت</th></tr></thead><tbody>' +
          getSortedStudents(c)
            .map((st) => {
              const r = calcStudentLesson(c, l, st.id);
              return (
                "<tr><td>" +
                esc(st.name) +
                "</td>" +
                ["practical", "theory"]
                  .map(
                    (field) =>
                      '<td><input aria-label="' +
                      (field === "midtermPractical"
                        ? "عملی میان‌ترم"
                        : field === "midtermTheory"
                          ? "تئوری میان‌ترم"
                          : field === "practical"
                            ? "عملی"
                            : "تئوری") +
                      " " +
                      esc(st.name) +
                      '" type="number" min="0" max="20" step="any" value="' +
                      (r[field] ?? "") +
                      '" data-lesson="' +
                      l.id +
                      '" data-student="' +
                      st.id +
                      '" data-field="' +
                      field +
                      '" onchange="saveKardaneshScore(this)"></td>',
                  )
                  .join("") +
                '<td data-kfinal="' +
                st.id +
                '">' +
                (r.final === null ? "—" : r.final.toFixed(2)) +
                '</td><td data-kstatus="' +
                st.id +
                '">' +
                gradeStatus(r) +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div></div>"
        );
      }

      async function saveKardaneshScore(input) {
        const { lesson: lid, student: sid, field } = input.dataset,
          c = getClassObj(state.schoolId, state.classId),
          l = getLessonObj(c, lid);
        if (
          !l ||
          l.gradeMode !== "kardanesh" ||
          !c.students.some((st) => st.id === sid) ||
          !["practical", "theory"].includes(field)
        )
          return;
        const value = input.value.trim() === "" ? null : Number(input.value);
        if (
          value !== null &&
          (!Number.isFinite(value) || value < 0 || value > 20)
        ) {
          input.setCustomValidity("نمره باید صفر تا بیست باشد.");
          input.reportValidity();
          return;
        }
        input.setCustomValidity("");
        const g = writableScoreRecord(
          l.kardaneshScores || (l.kardaneshScores = {}),
          sid,
        );
        if (value === null) delete g[field];
        else g[field] = value;
        l.kardaneshScores[sid] = g;
        await saveDB();
        const r = calcStudentLesson(
          getClassObj(state.schoolId, state.classId),
          getLessonObj(getClassObj(state.schoolId, state.classId), lid),
          sid,
        );
        document
          .querySelectorAll('[data-kfinal="' + sid + '"]')
          .forEach(
            (el) =>
              (el.textContent = r.final === null ? "—" : r.final.toFixed(2)),
          );
        document
          .querySelectorAll('[data-kstatus="' + sid + '"]')
          .forEach((el) => (el.textContent = gradeStatus(r)));
      }

      function normalizedName(name) {
        return name
          .normalize("NFKC")
          .replace(/ي/g, "ی")
          .replace(/ك/g, "ک")
          .replace(/[\s\u200c]+/g, " ")
          .trim();
      }

      async function restoreStudent(studentId) {
        const c = getClassObj(state.schoolId, state.classId),
          st = (c?.archivedStudents || []).find((x) => x.id === studentId);
        if (!st) return;
        if (c.students.some((x) => x.id === studentId))
          return alert("دانش‌آموز در فهرست فعال وجود دارد.");
        c.students.push({ ...st });
        c.archivedStudents = c.archivedStudents.filter(
          (x) => x.id !== studentId,
        );
        await saveDB({ classId: c.id });
        render();
      }

      function buildArchiveHtml(c) {
        if (!c.archivedStudents?.length) return "";
        return (
          '<div class="card"><h3>سوابق بایگانی‌شده</h3><p>سوابق کلاس قبلی حفظ شده‌اند. بازگردانی، عضویت فعال در این کلاس را دوباره برقرار می‌کند.</p>' +
          c.archivedStudents
            .map(
              (st) =>
                '<div class="row"><span>' +
                esc(st.name) +
                '</span><button class="ghost" data-id="' +
                st.id +
                '" onclick="showArchivedKarnameh(this.dataset.id)">کارنامه</button><button class="ghost" data-id="' +
                st.id +
                '" onclick="restoreStudent(this.dataset.id)">بازگردانی</button></div>',
            )
            .join("") +
          "</div>"
        );
      }

      function showArchivedKarnameh(studentId) {
        const c = getClassObj(state.schoolId, state.classId);
        if (c)
          showModal("کارنامه بایگانی", buildDetailedKarnamehHtml(c, studentId));
      }
