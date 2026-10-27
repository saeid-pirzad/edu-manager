function buildKardaneshEditor(c, l) {
  return buildAssessmentEditor(c, l);
}
let assessmentSelectedStage = "midterm";
async function openAssessmentStage(button) {
  const inModal = !!button.closest?.("#modalBody");
  const term = button.dataset.term;
  const stage = button.dataset.stage;
  if (!["اول", "دوم"].includes(term) || !["midterm", "final"].includes(stage))
    throw Error("مرحله ارزشیابی نامعتبر است.");
  const ensureCurrent = preserveAsyncTarget({ classScoped: true });
  const origin = { ...state };
  await flushDrafts({ strict: true });
  ensureCurrent();
  if (term !== workspace.term) {
    const periods = await allFrom("catalog");
    ensureCurrent();
    const target = periods.find((p) => p.year === workspace.year && p.term === term);
    if (!target) {
      openNewPeriod();
      document.getElementById("periodYear").value = workspace.year;
      document.getElementById("periodTerm").value = term;
      return;
    }
    const loaded = await readWorkspace(target.id);
    ensureCurrent();
    const targetLesson = loaded.data.schools.find((s) => s.id === origin.schoolId)
      ?.classes.find((c) => c.id === origin.classId)?.lessons.find((l) => l.id === origin.lessonId);
    if (!targetLesson)
      throw Error("این درس در نوبت مقصد وجود ندارد؛ ابتدا فهرست دروس آن نوبت را بررسی کنید.");
    await switchPeriod(target.id);
  }
  assessmentSelectedStage = stage;
  state = { ...origin, view: "lesson", tab: "grades" };
  render();
  if (inModal) {
    const c = getClassObj(state.schoolId, state.classId);
    const l = getLessonObj(c, state.lessonId);
    if (c && l) showModal("ثبت نمرات", buildAssessmentEditor(c, l));
  }
}
function buildAssessmentEditor(c, l) {
  const general = l.gradingPolicy?.subjectType === "general";
  const mid = assessmentSelectedStage === "midterm";
  const stage = assessmentSelectedStage;
  const stageName = (mid ? "میان‌ترم " : "پایان‌ترم ") + workspace.term;
  const students = getSortedStudents(c);
  let html = '<div class="card assessment-editor gradebook"><header class="gradebook-heading"><div><span class="gradebook-eyebrow">دفتر نمره</span><h3>' +
    esc(l.name) + '</h3><p>' + (general ? "درس عمومی · یک نمره از ۲۰" : "کاردانش · عملی و تئوری") +
    '</p></div><span class="gradebook-class-count">' + students.length.toLocaleString("fa-IR") +
    ' دانش‌آموز</span></header><nav class="assessment-navigation" aria-label="چهار مرحله نمرات سال">';
  for (const term of ["اول", "دوم"])
    for (const item of ["midterm", "final"])
      html += '<button type="button" data-workspace-action="assessment-stage" data-term="' + term + '" data-stage="' + item + '" aria-pressed="' + (workspace.term === term && stage === item) + '">' + (item === "midterm" ? "میان‌ترم " : "پایان‌ترم ") + term + '</button>';
  html += '</nav><div class="gradebook-simple-search"><input type="search" data-assessment-search="" aria-label="جست‌وجوی دانش‌آموز" placeholder="جست‌وجوی دانش‌آموز…" autocomplete="off"></div>';
  html += '<section class="assessment-stage" aria-label="' + esc(stageName) + '"><div class="assessment-students">';
  if (!students.length)
    html += '<div class="empty"><strong>هنوز دانش‌آموزی در کلاس نیست</strong><p>ابتدا از تب دانش‌آموزان، اعضای کلاس را اضافه کنید.</p></div>';
  for (const [index, st] of students.entries()) {
      const r = assessmentResult(l, st.id, stage);
      html +=
        '<article class="assessment-student" data-assessment-complete="' + r.complete + '" data-result-state="' + assessmentResultState(r) + '" data-assessment-name="' + esc(st.name) + '"><div class="gradebook-student"><span class="gradebook-number" aria-hidden="true">' +
        (index + 1).toLocaleString("fa-IR") + '</span><h4>' + esc(st.name) +
        '</h4></div><div class="assessment-inputs' + (general ? " general-inputs" : "") + '">' +
        (general ? "" : '<label><span>عملی <small>از ۲۰</small></span>' + gradeCell(c, l, st, mid ? "midtermPractical" : "practical", {
          value: r.practical,
        }) + "</label>") +
        '<label><span>' + (general ? "نمره" : "تئوری") + '<small>از ۲۰</small></span>' +
        gradeCell(c, l, st, mid ? "midtermTheory" : "theory", {
          value: r.theory,
        }) +
        '</label></div><div class="gradebook-result"><span>نتیجه</span><strong data-assessment-final="' +
        esc(st.id) +
        '" data-stage="' +
        stage +
        '">' +
        finalText(r) +
        "</strong> <span data-assessment-status>" +
        (r.complete ? gradeStatus(r) : "ناقص") +
        "</span></div></article>";
  }
  return html + '</div><p class="gradebook-no-results" role="status" hidden>دانش‌آموزی با این نام پیدا نشد.</p></section></div>';
}
function assessmentResultState(result) {
  if (!result.complete) return "incomplete";
  if (result.passed === false) return "review";
  return result.passed === true ? "passed" : "complete";
}
function buildKardaneshSummary(c, l, sid) {
  if (l.gradingPolicy) return courseUI.table(c, l, sid, false);
  return (
    '<div class="card"><h3>کاردانش — ' +
    esc(l.name) +
    '</h3><p>عملی ۷۰٪ + تئوری ۳۰٪؛ حد قبولی ۱۴. وضعیت قبولی با محاسبه ده‌دهی دقیق تعیین می‌شود.</p><div class="table-scroll"><table><thead><tr><th>دانش‌آموز</th><th>عملی</th><th>تئوری</th><th>نهایی</th><th>وضعیت</th></tr></thead><tbody>' +
    getSortedStudents(sid ? { students: knownStudents(c) } : c)
      .filter((st) => !sid || st.id === sid)
      .map((st) => {
        const r = calcV24(c, l, st.id);
        return (
          "<tr><td>" +
          esc(st.name) +
          "</td><td>" +
          (r.practical ?? "—") +
          "</td><td>" +
          (r.theory ?? "—") +
          "</td><td>" +
          finalText(r) +
          "</td><td>" +
          gradeStatus(r) +
          "</td></tr>"
        );
      })
      .join("") +
    "</tbody></table></div></div>"
  );
}

function refreshGradeResults() {
  for (const el of document.querySelectorAll("[data-assessment-final]")) {
    const article = el.closest(".assessment-student"),
      source = article?.querySelector("[data-grade]")?.dataset;
    const c = findClass(source?.class),
      l = getLessonObj(c, source?.lesson);
    if (!l) continue;
    const result = assessmentResult(
      l,
      el.dataset.assessmentFinal,
      el.dataset.stage,
    );
    el.textContent = finalText(result);
    article.dataset.assessmentComplete = String(result.complete);
    article.dataset.resultState = assessmentResultState(result);
    article.querySelector("[data-assessment-status]").textContent =
      result.complete ? gradeStatus(result) : "ناقص";
  }
  document.querySelectorAll("[data-kfinal]").forEach((el) => {
    const source = el.parentElement?.querySelector("[data-grade]")?.dataset,
      c = findClass(source?.class || state.classId),
      l = getLessonObj(c, source?.lesson || state.lessonId);
    if (!l) return;
    const sid = el.dataset.kfinal,
      r = calcV24(c, l, sid);
    el.textContent = finalText(r);
    const statusEl = el.parentElement?.querySelector("[data-kstatus]");
    if (statusEl) statusEl.textContent = gradeStatus(r);
  });
  refreshPolicyResults();
  for (const root of document.querySelectorAll(".gradebook")) {
    const rows = [...root.querySelectorAll("[data-assessment-complete]")];
    const completed = rows.filter((row) => row.dataset.assessmentComplete === "true").length;
    const progress = root.querySelector("[data-assessment-progress]");
    const text = root.querySelector("[data-assessment-progress-text]");
    if (progress) progress.value = completed;
    if (text) text.textContent = completed.toLocaleString("fa-IR") + " از " + rows.length.toLocaleString("fa-IR") + " تکمیل شده";
  }
  document.querySelectorAll("[data-grade]").forEach((input) => {
    const note = input.parentElement.querySelector(".grade-note"),
      item = drafts.get(inputKey(contextFromInput(input)));
    if (note) {
      const filled = input.value.trim() !== "";
      note.textContent = item ? item.error || "در انتظار ذخیره" : filled ? "ذخیره شد" : "";
      note.dataset.state = item ? (item.error ? "error" : "pending") : filled ? "saved" : "idle";
    }
  });
}

async function openBulkV24(lid) {
  const ensureCurrent = preserveAsyncTarget({ classScoped: true });
  await flushDrafts({ strict: true });
  ensureCurrent();
  const c = getClassObj(state.schoolId, state.classId),
    l = getLessonObj(c, lid);
  if (!l) return;
  if (l.gradeMode === "kardanesh") {
    showModal("نمرات میان‌ترم و پایان‌ترم", buildKardaneshEditor(c, l));
    return;
  }
  if (l.gradingPolicy) {
    showModal("ثبت نمرات براساس قواعد درس", courseUI.table(c, l, null, true));
    return;
  }
  let html =
    "<p>ورودی فارسی و انگلیسی؛ ذخیره خودکار با نمایش وضعیت. ثبت گروهی بر نمره جلسات اولویت دارد.</p>";
  for (const p of l.poudmans)
    for (const u of p.units)
      html +=
        '<div class="card"><h3>' +
        esc(p.name + " / " + u.name) +
        "</h3><table><thead><tr><th>دانش‌آموز</th><th>مستمر</th><th>پایانی</th></tr></thead><tbody>" +
        getSortedStudents(c)
          .map(
            (st) =>
              "<tr><td>" +
              esc(st.name) +
              "</td><td>" +
              gradeCell(c, l, st, "m", {
                kind: "u",
                pid: p.id,
                uid: u.id,
                value: ownScoreRecord(u.unitScores, st.id)?.m,
              }) +
              "</td><td>" +
              gradeCell(c, l, st, "p", {
                kind: "u",
                pid: p.id,
                uid: u.id,
                value: ownScoreRecord(u.unitScores, st.id)?.p,
              }) +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table></div>";
  showModal("ثبت گروهی نمرات", html);
}
