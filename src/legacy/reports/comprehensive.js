function renderReports() {
  const tab = state.reportTab || "comprehensive";
  const periodic = ["daily", "weekly", "monthly", "annual"].includes(tab);
  const periodicContent = periodic ? EduPeriodicReports.render(tab) : "";
  let h =
    headerHtml() +
    '<header class="report-page-heading"><h2>گزارش‌ها و کارنامه‌ها</h2></header>';
  h +=
    '<nav class="tabs report-navigation no-print" aria-label="نوع گزارش">' +
    [
      ["karnameh", "کارنامه", "grades"],
      ["daily", "روزانه", "calendar"],
      ["weekly", "هفتگی", "calendar-week"],
      ["monthly", "ماهانه", "calendar-month"],
      ["annual", "سالانه", "report"],
    ]
      .map(
        ([key, label, icon]) =>
          `<button type="button" ${tab === key ? 'aria-current="page" ' : ""}class="${tab === key ? "active" : ""}" data-legacy-click="reports-comprehensive:0" data-legacy-click-arg2="${esc(key)}">` +
          '<span class="report-tab-icon" aria-hidden="true">' +
          EduIcons.html(icon) +
          '</span><span class="report-tab-label">' +
          label +
          "</span></button>",
      )
      .join("") +
    "</nav>";
  h += `<details class="report-extra no-print"><summary>گزارش‌های دیگر</summary><div class="row"><button class="ghost" data-legacy-click="reports-comprehensive:2">ریز فعالیت‌ها</button><button class="ghost" data-legacy-click="reports-comprehensive:3">گزارش دروس</button></div></details>`;
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
      <div style="font-size:.9em;font-weight:600;color:var(--theme-muted, #5a6179);margin-bottom:8px">حالت نمایش گزارش:</div>
      <div class="row" style="margin-bottom:12px">
        <label><input type="radio" name="reportMode" value="summary" ${globalFilter.reportMode === "summary" ? "checked" : ""} data-legacy-change="reports-comprehensive:10"> خلاصه (جدولی)</label>
        <label><input type="radio" name="reportMode" value="detailed" ${globalFilter.reportMode === "detailed" ? "checked" : ""} data-legacy-change="reports-comprehensive:11"> گزارش کامل</label>
      </div>
      <div style="font-size:.9em;font-weight:600;color:var(--theme-muted, #5a6179);margin-bottom:8px">اطلاعات موجود در گزارش:</div>
      <div class="row" style="margin-bottom:8px">
        <label><input type="checkbox" ${globalFilter.showAttendance ? "checked" : ""} data-legacy-change="reports-comprehensive:12"> حضور و غیاب</label>
        <label><input type="checkbox" ${globalFilter.showScores ? "checked" : ""} data-legacy-change="reports-comprehensive:13"> نمرات</label>
        <label><input type="checkbox" ${globalFilter.showPosNeg ? "checked" : ""} data-legacy-change="reports-comprehensive:14"> مثبت / منفی</label>
        <label><input type="checkbox" ${globalFilter.showHomework ? "checked" : ""} data-legacy-change="reports-comprehensive:15"> تکالیف</label>
      </div>
      <div style="font-size:.9em;font-weight:600;color:var(--theme-muted, #5a6179);margin-bottom:8px">نمایش اسامی (برای حضور و غیاب):</div>
      <div class="row" style="margin-bottom:0">
        <label style="color:var(--status-success, #16664e)"><input type="checkbox" ${globalFilter.showPresentNames ? "checked" : ""} data-legacy-change="reports-comprehensive:16"> نام حاضرین</label>
        <label style="color:var(--status-danger, #9f2635)"><input type="checkbox" ${globalFilter.showAbsentNames ? "checked" : ""} data-legacy-change="reports-comprehensive:17"> نام غایبین</label>
        <label style="color:var(--status-warning, #7c5105)"><input type="checkbox" ${globalFilter.showLateNames ? "checked" : ""} data-legacy-change="reports-comprehensive:18"> نام تأخیری‌ها</label>
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

function createGlobalReportModel(findClass = findClassById) {
  return EduActivityReportModel({
    findClass,
    getLesson: getLessonObj,
    sessionStudents,
    sessionStudent,
    attendance: EduReportAttendance,
    typeLabel: (type) => TYPE_LABELS[type],
  });
}

function getFilteredSessions(source = db) {
  return EduActivityReportModel({}).filterSessions(source, globalFilter);
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

  const report = createGlobalReportModel().build(
    filteredSessions,
    globalFilter,
  );
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
    report.rows.forEach(
      ({
        session: sess,
        classInfo: cls,
        lesson,
        attendance,
        studentAttendance,
        scores,
      }) => {
        h += `<tr><td>${faDate(sess.date)}</td><td>${esc(cls.classObj.name)}</td><td>${esc(lesson.name)}</td><td>زنگ ${sess.period + 1}</td>`;
        if (globalFilter.studentId) {
          if (globalFilter.showAttendance) {
            const st = studentAttendance;
            let attText = '<span class="muted">ثبت نشده</span>';
            if (st.status === "present")
              attText = '<span class="badge present">حاضر</span>';
            else if (st.status === "leave")
              attText = '<span class="badge leave">مرخصی</span>';
            else if (st.status === "absent")
              attText = '<span class="badge absent">غایب</span>';
            else if (st.status === "late") {
              attText = `<span class="badge late">تأخیر${st.minutes === null ? "" : " (" + st.minutes + "د)"}</span>`;
            }
            h += `<td>${attText}</td>`;
          }
          if (globalFilter.showScores) {
            const ms = scores.mostamar
              .map((x) => `${x.value}`)
              .map(esc)
              .join("، ");
            const ps = scores.payani
              .map((x) => `${x.value}`)
              .map(esc)
              .join("، ");
            const classMarks = scores.classGrade
              .map((score) => score.value)
              .join("، ");
            const activityMarks = scores.activity
              .map((score) => score.value)
              .join("، ");
            h +=
              "<td>" +
              (ms || "—") +
              " / " +
              (ps || "—") +
              (classMarks ? "<br>کلاسی: " + esc(classMarks) : "") +
              (activityMarks ? "<br>فعالیت: " + esc(activityMarks) : "") +
              "</td>";
          }
          if (globalFilter.showPosNeg) {
            const pos = scores.positive;
            const neg = scores.negative;
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
            const hw = scores.homework;
            h += `<td>${hw.length ? hw.length : '<span class="muted">0</span>'}</td>`;
          }
        } else {
          if (globalFilter.showAttendance) {
            const { counts } = attendance;
            h += `<td>✅${counts.present + counts.late} ❌${counts.absent} ⏰${counts.late} · مرخصی ${counts.leave} · تعیین‌نشده ${counts.unknown}</td>`;
          }
          if (globalFilter.showScores) {
            const m = scores.mostamar.length;
            const pay = scores.payani.length;
            const classMarks = scores.classGrade.length;
            const activityMarks = scores.activity.length;
            h +=
              "<td>" +
              (m || pay || classMarks || activityMarks
                ? "مستمر: " +
                  m +
                  " · پایانی: " +
                  pay +
                  " · کلاسی: " +
                  classMarks +
                  " · فعالیت: " +
                  activityMarks
                : "—") +
              "</td>";
          }
          if (globalFilter.showPosNeg) {
            const pos = scores.positive.length;
            const neg = scores.negative.length;
            h += `<td style="color:var(--status-success, #16664e);font-weight:600">${pos}</td>`;
            h += `<td style="color:var(--status-danger, #9f2635);font-weight:600">${neg}</td>`;
          }
          if (globalFilter.showHomework) {
            const hw = scores.homework.length;
            h += `<td>${hw}</td>`;
          }
        }
        h += `</tr>`;
      },
    );
    h += `</tbody></table></div>`;
  } else {
    h += `<div class="detailed-report-box">`;
    let mainHeader = `📊 <b>گزارش جامع عملکرد کلاسی</b><br>`;
    if (globalFilter.date)
      mainHeader += `📅 تاریخ: ${faDate(globalFilter.date)}<br>`;
    else mainHeader += `📅 تاریخ تهیه گزارش: ${faDate(todayISO())}<br>`;
    if (globalFilter.classId) {
      const cls = findClassById(globalFilter.classId);
      mainHeader += `🏫 مدرسه: ${esc(cls.school.name)} | کلاس: ${esc(cls.classObj.name)}<br>`;
    }
    h += `<h2 style="text-align:center">${mainHeader}</h2>`;
    report.periods.forEach(({ period: periodNum, rows }) => {
      h += `<div class="period-block"><div class="period-title">⏰ ${getPeriodName(periodNum)}</div>`;
      rows.forEach(
        ({
          session: sess,
          classInfo: cls,
          lesson,
          attendance,
          scores,
          entries,
        }) => {
          h += `<div class="session-detail"><b>📅 تاریخ:</b> ${faDate(sess.date)} | <b>📚 درس:</b> ${esc(lesson.name)} | <b>👨‍🏫 دبیر:</b> ${esc(lesson.teacher || "---")} | <b>کلاس:</b> ${esc(cls.classObj.name)}<br>`;
          if (globalFilter.showAttendance) {
            const {
              presentNames,
              absentNames,
              leaveNames,
              lateNames,
              unknownNames,
            } = attendance;
            if (unknownNames.length)
              h += `<div class="names-list muted"><b>تعیین‌نشده (${unknownNames.length}):</b> ${unknownNames.map(esc).join("، ")}</div>`;
            if (leaveNames.length)
              h += `<div class="names-list"><b>مرخصی:</b> ${leaveNames.map(esc).join("، ")}</div>`;
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
              lateNames.length === 0 &&
              leaveNames.length === 0
            )
              h += `<div class="names-list muted">وضعیت حضور ثبت نشده است.</div>`;
          }
          if (globalFilter.showScores) {
            const exams = scores.exams;
            if (exams.length)
              h +=
                `<div class="names-list" style="color:var(--status-info, #1d4f91);margin-top:8px">📊 نمرات: ` +
                entries.exams.map(esc).join("، ") +
                `</div>`;
          }
          if (globalFilter.showPosNeg) {
            const pos = scores.positive;
            const neg = scores.negative;
            if (pos.length)
              h +=
                `<div class="names-list" style="color:var(--status-success, #16664e);margin-top:4px">➕ مثبت (${pos.length}): ` +
                entries.positive.map(esc).join("، ") +
                `</div>`;
            if (neg.length)
              h +=
                `<div class="names-list" style="color:var(--status-danger, #9f2635);margin-top:4px">➖ منفی (${neg.length}): ` +
                entries.negative.map(esc).join("، ") +
                `</div>`;
          }
          if (globalFilter.showHomework) {
            const hw = scores.homework;
            if (hw.length)
              h +=
                `<div class="names-list" style="color:var(--status-info, #1d4f91);margin-top:4px">📝 تکالیف (${hw.length}): ` +
                entries.homework.map(esc).join("، ") +
                `</div>`;
          }
          h += `</div><hr style="border:0;border-top:1px dashed var(--theme-line, #e4e4e7);margin:10px 0">`;
        },
      );
      h += `</div>`;
    });
    h += `</div>`;
  }
  h += `</div>`;
  out.innerHTML = h;
}

function copyGlobalReportText(btn) {
  return EduV24.copyReport(buildGlobalReportText, btn);
}

function buildGlobalReportText(source = db) {
  const findClass = (classId, schoolId = "") => {
    for (const school of source.schools) {
      if (schoolId && school.id !== schoolId) continue;
      const classObj = school.classes.find((item) => item.id === classId);
      if (classObj) return { school, classObj };
    }
    return null;
  };
  const filteredSessions = getFilteredSessions(source);
  if (filteredSessions.length === 0) return alert("موردی برای گزارش یافت نشد.");
  let text = `📊 گزارش جامع عملکرد کلاسی\n`;
  if (globalFilter.date)
    text += `📅 تاریخ گزارش: ${faDate(globalFilter.date)}\n`;
  else text += `📅 تاریخ تهیه گزارش: ${faDate(todayISO())}\n`;
  if (globalFilter.classId) {
    const cls = findClass(globalFilter.classId, globalFilter.schoolId);
    text += `🏫 مدرسه: ${cls.school.name} | کلاس: ${cls.classObj.name}\n`;
  }
  text += `================================\n\n`;
  const report = createGlobalReportModel(findClass).build(
    filteredSessions,
    globalFilter,
  );
  if (globalFilter.reportMode === "summary") {
    report.rows.forEach(
      ({
        session: sess,
        classInfo: cls,
        lesson,
        attendance,
        studentAttendance,
        scores,
      }) => {
        text += `📅 ${faDate(sess.date)} | کلاس: ${cls.classObj.name} | درس: ${lesson.name} | ${getPeriodName(sess.period)}\n`;
        if (globalFilter.studentId) {
          const stObj = sessionStudent(
            cls.classObj,
            sess,
            globalFilter.studentId,
          );
          if (globalFilter.showAttendance) {
            const st = studentAttendance;
            let att = "ثبت نشده";
            if (st.status === "present") att = "حاضر";
            else if (st.status === "leave") att = "مرخصی";
            else if (st.status === "absent") att = "غایب";
            else if (st.status === "late")
              att = "تأخیر" + (st.minutes === null ? "" : ` (${st.minutes}د)`);
            text += `   👤 ${stObj?.name || ""}: ${att}\n`;
          }
          if (globalFilter.showScores) {
            const ms = scores.mostamar.map((x) => x.value).join("، ");
            const ps = scores.payani.map((x) => x.value).join("، ");
            if (scores.classGrade.length)
              text +=
                "   - نمره کلاسی: " +
                scores.classGrade.map((score) => score.value).join("، ") +
                "\n";
            const activityMarks = scores.activity;
            if (activityMarks.length)
              text +=
                "   - امتیاز فعالیت: " +
                activityMarks.map((score) => score.value).join("، ") +
                "\n";
            if (ms || ps)
              text += `   - مستمر: ${ms || "—"} | پایانی: ${ps || "—"}\n`;
          }
          if (globalFilter.showPosNeg) {
            const pos = scores.positive;
            const neg = scores.negative;
            text += `   - ➕ مثبت (${pos.length}): ${pos.map((x) => `(${x.value})`).join("، ") || "—"}\n`;
            text += `   - ➖ منفی (${neg.length}): ${neg.map((x) => `(${x.value})`).join("، ") || "—"}\n`;
          }
          if (globalFilter.showHomework) {
            const hw = scores.homework;
            if (hw.length) text += `   - 📝 تکالیف: ${hw.length}\n`;
          }
        } else {
          if (globalFilter.showAttendance) {
            const { counts } = attendance;
            text += `   👥 حضور: حاضر ${counts.present + counts.late} | غایب ${counts.absent} | مرخصی ${counts.leave} | تأخیر ${counts.late} | تعیین‌نشده ${counts.unknown}\n`;
          }
          if (globalFilter.showScores) {
            const m = scores.mostamar.length;
            const pay = scores.payani.length;
            const classMarks = scores.classGrade;
            const activityMarks = scores.activity;
            if (classMarks.length)
              text +=
                "   - نمرات کلاسی: " +
                classMarks.map((score) => score.value).join("، ") +
                "\n";
            if (activityMarks.length)
              text +=
                "   - امتیاز فعالیت: " +
                activityMarks.map((score) => score.value).join("، ") +
                "\n";
            if (m || pay) text += `   - 📊 نمرات: مستمر ${m} | پایانی ${pay}\n`;
          }
          if (globalFilter.showPosNeg) {
            const pos = scores.positive.length;
            const neg = scores.negative.length;
            text += `   - ➕ مثبت: ${pos} | ➖ منفی: ${neg}\n`;
          }
          if (globalFilter.showHomework) {
            const hw = scores.homework.length;
            if (hw) text += `   - 📝 تکالیف: ${hw}\n`;
          }
        }
        text += `\n`;
      },
    );
  } else {
    report.periods.forEach(({ period: periodNum, rows }) => {
      text += `📌 ${getPeriodName(periodNum)}:\n`;
      rows.forEach(
        ({
          session: sess,
          classInfo: cls,
          lesson,
          attendance,
          scores,
          entries,
        }) => {
          text += `🔹 تاریخ: ${faDate(sess.date)} | درس: ${lesson.name} | دبیر: ${lesson.teacher || "---"} | کلاس: ${cls.classObj.name}\n`;
          if (globalFilter.showAttendance) {
            const {
              presentNames,
              absentNames,
              leaveNames,
              lateNames,
              unknownNames,
            } = attendance;
            if (unknownNames.length)
              text += `   تعیین‌نشده (${unknownNames.length}): ${unknownNames.join("، ")}\n`;
            if (leaveNames.length)
              text += `   مرخصی (${leaveNames.length}): ${leaveNames.join("، ")}\n`;
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
            const ex = scores.exams;
            if (ex.length)
              text += `   📊 نمرات: ` + entries.exams.join("، ") + `\n`;
          }
          if (globalFilter.showPosNeg) {
            const pos = scores.positive;
            const neg = scores.negative;
            if (pos.length)
              text +=
                `   ➕ مثبت (${pos.length}): ` +
                entries.positive.join("، ") +
                `\n`;
            if (neg.length)
              text +=
                `   ➖ منفی (${neg.length}): ` +
                entries.negative.join("، ") +
                `\n`;
          }
          if (globalFilter.showHomework) {
            const hw = scores.homework;
            if (hw.length)
              text +=
                `   📝 تکالیف (${hw.length}): ` +
                entries.homework.join("، ") +
                `\n`;
          }
          text += `\n`;
        },
      );
      text += `--------------------------------\n`;
    });
  }
  text += `\n✅ تولید شده توسط کلاس‌یار`;
  return text;
}

// ==================== زیربخش ۲: گزارش درس ====================
