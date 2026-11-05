function buildKardaneshEditor(c, l) {
  return buildAssessmentEditor(c, l);
}
let assessmentSelectedStage = "midterm";
async function openAssessmentStage(button) {
  const inModal = !!button.closest?.("#modalBody"),
    term = button.dataset.term,
    stage = button.dataset.stage;
  if (!["اول", "دوم"].includes(term) || !["midterm", "final"].includes(stage))
    throw Error("مرحله ارزشیابی نامعتبر است.");
  const ensureCurrent = preserveAsyncTarget({ classScoped: true }),
    origin = { ...state },
    editor = button.closest?.(".assessment-editor")?.dataset;
  if (editor?.assessmentLesson) origin.lessonId = editor.assessmentLesson;
  await flushDrafts({ strict: true });
  ensureCurrent();
  await assessmentContext.select(academicTermKind(term), stage, {
    schoolId: origin.schoolId,
    classId: origin.classId,
    lessonId: origin.lessonId,
  });
  ensureCurrent();
  assessmentSelectedStage = stage;
  state = { ...origin, view: "lesson", tab: "grades" };
  render();
  if (inModal) {
    const classroom = getClassObj(state.schoolId, state.classId),
      lesson = getLessonObj(classroom, state.lessonId);
    if (classroom && lesson)
      showModal("ثبت نمرات", buildAssessmentEditor(classroom, lesson));
  }
}

function buildAssessmentEditor(c, l) {
  const context = assessmentContext.resolve(c, l);
  if (context) {
    c = context.classroom;
    l = context.lesson;
  }
  const period = context?.period || workspace;
  const general = l.gradingPolicy?.subjectType === "general";
  const stage = context?.stage || assessmentSelectedStage;
  const mid = stage === "midterm";
  const students = getSortedStudents(c);
  const term =
    (period.termKind || academicTermKind(period.term)) === "second"
      ? "دوم"
      : "اول";
  const stageName = (mid ? "میان‌ترم نوبت " : "پایان‌ترم نوبت ") + term;
  const weights = assessmentWeights(l);
  let html =
    '<div class="card assessment-editor gradebook" data-assessment-lesson="' +
    esc(l.id) +
    '"><header class="gradebook-heading"><span class="gradebook-heading-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M6 3h12v18H6V3ZM9 7h6M9 11h6M9 15h2m2 2 2 2 4-4"/></svg></span><div class="gradebook-heading-content"><h3>' +
    esc(l.name) +
    '</h3><div class="gradebook-meta"><span class="gradebook-method">' +
    (general ? "عمومی · یک نمره از ۲۰" : "کاردانش · عملی و تئوری") +
    '</span><span class="gradebook-class-count"><bdi>' +
    students.length.toLocaleString("fa-IR") +
    '</bdi> هنرجو</span></div></div></header><nav class="assessment-navigation assessment-term-navigation" aria-label="انتخاب مرحلهٔ نمره‌دهی">';
  for (const item of [
    { term: "اول", stage: "midterm", label: "میان‌ترم اول" },
    { term: "اول", stage: "final", label: "پایان‌ترم اول" },
    { term: "دوم", stage: "midterm", label: "میان‌ترم دوم" },
    { term: "دوم", stage: "final", label: "پایان‌ترم دوم" },
  ])
    html +=
      '<button type="button" data-workspace-action="assessment-stage" data-term="' +
      item.term +
      '" data-stage="' +
      item.stage +
      '" aria-pressed="' +
      (term === item.term && stage === item.stage) +
      '">' +
      item.label +
      "</button>";
  html +=
    '</nav><div class="gradebook-simple-search"><input type="search" data-assessment-search="" aria-label="جست‌وجوی دانش‌آموز" placeholder="جست‌وجوی دانش‌آموز…" autocomplete="off"></div>';
  if (context?.stale)
    html +=
      '<p class="muted" role="status">اطلاعات این مرحله تغییر کرده است؛ صفحه را دوباره بارگذاری و پیش‌نویس‌ها را بررسی کنید. پیش‌نویس‌های ذخیره‌نشده محفوظ‌اند.</p>';
  if (context?.period.closed)
    html +=
      '<p class="muted" role="status">این مرحله بسته است و نمرات آن فقط نمایش داده می‌شوند؛ سایر بخش‌های سال تحصیلی قابل استفاده‌اند.</p>';
  html +=
    '<section class="assessment-stage" aria-label="' +
    esc(stageName) +
    '"><div class="assessment-students">';
  if (!students.length)
    html +=
      '<div class="empty"><strong>هنوز دانش‌آموزی در کلاس نیست</strong><p>ابتدا از تب دانش‌آموزان، اعضای کلاس را اضافه کنید.</p></div>';
  for (const [index, st] of students.entries()) {
    const r = assessmentResult(l, st.id, stage);
    html +=
      '<article class="assessment-student" data-assessment-complete="' +
      r.complete +
      '" data-result-state="' +
      assessmentResultState(r) +
      '" data-assessment-name="' +
      esc(st.name) +
      '"><div class="gradebook-student"><span class="gradebook-number" aria-hidden="true">' +
      (index + 1).toLocaleString("fa-IR") +
      "</span><h4>" +
      esc(st.name) +
      '</h4></div><div class="assessment-inputs' +
      (general ? " general-inputs" : "") +
      '">' +
      (general
        ? ""
        : '<label><span class="assessment-field-heading"><span>عملی<small class="assessment-field-range">از ۲۰</small></span><small class="assessment-field-weight"><bdi>' +
          weights.practical.toLocaleString("fa-IR") +
          "٪</bdi></small></span>" +
          assessmentContext.cell(
            c,
            l,
            st,
            mid ? "midtermPractical" : "practical",
            {
              value: r.practical,
            },
          ) +
          "</label>") +
      '<label><span class="assessment-field-heading"><span>' +
      (general ? "نمره" : "تئوری") +
      '<small class="assessment-field-range">از ۲۰</small></span>' +
      (general
        ? ""
        : '<small class="assessment-field-weight"><bdi>' +
          weights.theory.toLocaleString("fa-IR") +
          "٪</bdi></small>") +
      "</span>" +
      assessmentContext.cell(c, l, st, mid ? "midtermTheory" : "theory", {
        value: r.theory,
      }) +
      '</label></div><div class="gradebook-result"><span>' +
      (general ? "نمره ثبت‌شده" : "میانگین وزنی") +
      '</span><strong data-assessment-final="' +
      esc(st.id) +
      '" data-stage="' +
      stage +
      '">' +
      finalText(r) +
      "</strong> <span data-assessment-status>" +
      (r.complete ? gradeStatus(r) : "ناقص") +
      "</span></div></article>";
  }
  return (
    html +
    '</div><p class="gradebook-no-results" role="status" hidden>دانش‌آموزی با این نام پیدا نشد.</p></section></div>'
  );
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
    const context = source?.assessmentContext
      ? assessmentContext.resolve(c, l)
      : null;
    const result = assessmentResult(
      context?.lesson || l,
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
    const completed = rows.filter(
      (row) => row.dataset.assessmentComplete === "true",
    ).length;
    const progress = root.querySelector("[data-assessment-progress]");
    const text = root.querySelector("[data-assessment-progress-text]");
    if (progress) progress.value = completed;
    if (text)
      text.textContent =
        completed.toLocaleString("fa-IR") +
        " از " +
        rows.length.toLocaleString("fa-IR") +
        " تکمیل شده";
  }
  document.querySelectorAll("[data-grade]").forEach((input) => {
    if (assessmentContext.handles(input)) {
      assessmentContext.refreshInput(input);
      return;
    }
    const note = input.parentElement.querySelector(".grade-note"),
      item = drafts.get(inputKey(contextFromInput(input)));
    input.setAttribute("aria-invalid", item?.error ? "true" : "false");
    if (note) {
      const filled = input.value.trim() !== "";
      note.textContent = item
        ? item.error || "در انتظار ذخیره"
        : filled
          ? "ذخیره شد"
          : "";
      note.dataset.state = item
        ? item.error
          ? "error"
          : "pending"
        : filled
          ? "saved"
          : "idle";
    }
  });
  for (const row of document.querySelectorAll(
    ".gradebook .assessment-student",
  )) {
    const notes = [...row.querySelectorAll(".grade-note")];
    row.dataset.editState = notes.some((note) => note.dataset.state === "error")
      ? "error"
      : notes.some((note) => note.dataset.state === "pending")
        ? "pending"
        : "saved";
  }
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
