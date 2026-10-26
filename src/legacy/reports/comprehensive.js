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
    (filter.schoolId ? schools[0]?.name : "همه مدارس") || "مدرسه انتخاب‌شده";
  let h =
    headerHtml() +
    '<header class="report-page-heading"><p>تصویر روشن از عملکرد کلاس‌ها</p><h2>گزارش‌ها و کارنامه‌ها</h2><span>' +
    esc(scope) +
    (filter.classId ? " · " + esc(classes[0]?.name || "کلاس انتخاب‌شده") : "") +
    "</span></header>";
  h +=
    '<section class="report-scope-summary no-print"><span><strong>' +
    classes.length.toLocaleString("fa-IR") +
    "</strong> کلاس</span><span><strong>" +
    classes.reduce((n, c) => n + c.students.length, 0).toLocaleString("fa-IR") +
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
          `<button type="button" ${tab === key ? 'aria-current="page" ' : ""}class="${tab === key ? "active" : ""}" data-legacy-click="reports-comprehensive:0" data-legacy-click-arg2="${esc(key)}">` +
          label +
          "</button>",
      )
      .join("") +
    "</nav>";
  h += `<details class="report-extra no-print"><summary>کارنامه و گزارش‌های دیگر</summary><div class="row"><button class="ghost" data-legacy-click="reports-comprehensive:1">کارنامه نمرات</button><button class="ghost" data-legacy-click="reports-comprehensive:2">ریز فعالیت‌ها</button><button class="ghost" data-legacy-click="reports-comprehensive:3">گزارش دروس</button></div></details>`;
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
      <input type="date" value="${globalFilter.date}" data-legacy-change="reports-comprehensive:4" title="فیلتر تاریخ">
      <select data-legacy-change="reports-comprehensive:5">
        <option value="">همه مدارس</option>
        ${db.schools.map((s) => `<option value="${s.id}" ${globalFilter.schoolId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
      </select>
      <select data-legacy-change="reports-comprehensive:6">
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
      <select data-legacy-change="reports-comprehensive:7">
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
      <select data-legacy-change="reports-comprehensive:8">
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
      <select data-legacy-change="reports-comprehensive:9">
        <option value="">همه زنگ‌ها</option>
        ${Array.from({ length: 12 }, (_, i) => `<option value="${i}" ${globalFilter.period == String(i) ? "selected" : ""}>زنگ ${i + 1}</option>`).join("")}
      </select>
    </div>
    <div class="filter-box">
      <div style="font-size:.9em;font-weight:600;color:#475569;margin-bottom:8px">حالت نمایش گزارش:</div>
      <div class="row" style="margin-bottom:12px">
        <label><input type="radio" name="reportMode" value="summary" ${globalFilter.reportMode === "summary" ? "checked" : ""} data-legacy-change="reports-comprehensive:10"> خلاصه (جدولی)</label>
        <label><input type="radio" name="reportMode" value="detailed" ${globalFilter.reportMode === "detailed" ? "checked" : ""} data-legacy-change="reports-comprehensive:11"> گزارش کامل</label>
      </div>
      <div style="font-size:.9em;font-weight:600;color:#475569;margin-bottom:8px">اطلاعات موجود در گزارش:</div>
      <div class="row" style="margin-bottom:8px">
        <label><input type="checkbox" ${globalFilter.showAttendance ? "checked" : ""} data-legacy-change="reports-comprehensive:12"> حضور و غیاب</label>
        <label><input type="checkbox" ${globalFilter.showScores ? "checked" : ""} data-legacy-change="reports-comprehensive:13"> نمرات</label>
        <label><input type="checkbox" ${globalFilter.showPosNeg ? "checked" : ""} data-legacy-change="reports-comprehensive:14"> مثبت / منفی</label>
        <label><input type="checkbox" ${globalFilter.showHomework ? "checked" : ""} data-legacy-change="reports-comprehensive:15"> تکالیف</label>
      </div>
      <div style="font-size:.9em;font-weight:600;color:#475569;margin-bottom:8px">نمایش اسامی (برای حضور و غیاب):</div>
      <div class="row" style="margin-bottom:0">
        <label style="color:#059669"><input type="checkbox" ${globalFilter.showPresentNames ? "checked" : ""} data-legacy-change="reports-comprehensive:16"> نام حاضرین</label>
        <label style="color:#dc2626"><input type="checkbox" ${globalFilter.showAbsentNames ? "checked" : ""} data-legacy-change="reports-comprehensive:17"> نام غایبین</label>
        <label style="color:#d97706"><input type="checkbox" ${globalFilter.showLateNames ? "checked" : ""} data-legacy-change="reports-comprehensive:18"> نام تأخیری‌ها</label>
        <button class="ghost" data-legacy-click="reports-comprehensive:19" style="margin-right:auto;font-size:.85em;padding:4px 10px">♻️ ریست فیلترها</button>
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
        <button class="success" data-legacy-click="reports-comprehensive:20">📋 کپی متن</button>
        <button data-legacy-click="reports-comprehensive:21">🖨️ چاپ / PDF</button>
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
          const m = sess.scores.filter((x) => x.type === "mostamar").length;
          const pay = sess.scores.filter((x) => x.type === "payani").length;
          const classMarks = sess.scores.filter(
            (score) => score.type === "classGrade",
          ).length;
          h +=
            "<td>" +
            (m || pay || classMarks
              ? "مستمر: " + m + " · پایانی: " + pay + " · کلاسی: " + classMarks
              : "—") +
            "</td>";
        }
        if (globalFilter.showPosNeg) {
          const pos = sess.scores.filter((x) => x.type === "positive").length;
          const neg = sess.scores.filter((x) => x.type === "negative").length;
          h += `<td style="color:#059669;font-weight:600">${pos}</td>`;
          h += `<td style="color:#dc2626;font-weight:600">${neg}</td>`;
        }
        if (globalFilter.showHomework) {
          const hw = sess.scores.filter((x) => x.type === "homework").length;
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
      if (!groupedByPeriod[sess.period]) groupedByPeriod[sess.period] = [];
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
              const mins = status.includes(":") ? status.split(":")[1] : "";
              lateNames.push(`${st.name} ${mins ? "(" + mins + "د)" : ""}`);
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
                  const st = sessionStudent(cls.classObj, sess, x.studentId);
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
                  const st = sessionStudent(cls.classObj, sess, x.studentId);
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
                  const st = sessionStudent(cls.classObj, sess, x.studentId);
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
                  const st = sessionStudent(cls.classObj, sess, x.studentId);
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
  if (filteredSessions.length === 0) return alert("موردی برای گزارش یافت نشد.");
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
          const m = sess.scores.filter((x) => x.type === "mostamar").length;
          const pay = sess.scores.filter((x) => x.type === "payani").length;
          const classMarks = sess.scores.filter(
            (score) => score.type === "classGrade",
          );
          if (classMarks.length)
            text +=
              "   - نمرات کلاسی: " +
              classMarks.map((score) => score.value).join("، ") +
              "\n";
          if (m || pay) text += `   - 📊 نمرات: مستمر ${m} | پایانی ${pay}\n`;
        }
        if (globalFilter.showPosNeg) {
          const pos = sess.scores.filter((x) => x.type === "positive").length;
          const neg = sess.scores.filter((x) => x.type === "negative").length;
          text += `   - ➕ مثبت: ${pos} | ➖ منفی: ${neg}\n`;
        }
        if (globalFilter.showHomework) {
          const hw = sess.scores.filter((x) => x.type === "homework").length;
          if (hw) text += `   - 📝 تکالیف: ${hw}\n`;
        }
      }
      text += `\n`;
    });
  } else {
    const groupedByPeriod = {};
    filteredSessions.forEach((sess) => {
      if (!groupedByPeriod[sess.period]) groupedByPeriod[sess.period] = [];
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
              const mins = status.includes(":") ? status.split(":")[1] : "";
              lateNames.push(`${st.name} ${mins ? "(" + mins + "د)" : ""}`);
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
                  const s = sessionStudent(cls.classObj, sess, x.studentId);
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
                  const s = sessionStudent(cls.classObj, sess, x.studentId);
                  return `${s ? s.name : ""}(${x.value})`;
                })
                .join("، ") +
              `\n`;
          if (neg.length)
            text +=
              `   ➖ منفی (${neg.length}): ` +
              neg
                .map((x) => {
                  const s = sessionStudent(cls.classObj, sess, x.studentId);
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
                  const s = sessionStudent(cls.classObj, sess, x.studentId);
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
