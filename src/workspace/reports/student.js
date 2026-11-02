function openKarnamehStudent(classId, studentId = "") {
  assertWorkspaceReadable();
  const found = findClassById(classId);
  if (
    !found ||
    (studentId &&
      ![
        ...found.classObj.students,
        ...(found.classObj.archivedStudents || []),
      ].some((student) => student.id === studentId))
  )
    throw Error(
      "هنرجو یا کلاس دیگر در دسترس نیست؛ کارنامه را دوباره انتخاب کنید.",
    );
  karnamehFilter = { schoolId: found.school.id, classId, studentId };
  state.view = "reports";
  state.reportTab = "karnameh";
  closeModal();
  render();
}

function validateFrozenReport(report) {
  return EduFrozenReportValidator.validate(report, {
    assertSafeDataTree,
    isDataObject,
    isSafeRecordId,
    weightedKardanesh,
    gradePolicy: EduPolicy,
  });
}

function frozenLessonRows(lesson) {
  if (lesson.policy?.method === "modular" && lesson.modules?.length)
    return (
      "<tr><td>" +
      esc(lesson.name) +
      '</td><td colspan="4">' +
      modularReportGrades(lesson.modules, lesson) +
      "</td><td>" +
      esc(gradeStatus(lesson)) +
      "</td></tr>"
    );
  const dual = lesson.mode === "kardanesh";
  const stages = dual ? ["midterm", "final"] : ["final"];
  return stages
    .map((stage) => {
      const result = dual
        ? lesson.assessments?.[stage] || (stage === "final" ? lesson : null)
        : lesson;
      const practical = result
        ? lesson.policy?.subjectType === "general"
          ? null
          : dual
            ? result.practical
            : lesson.payani
        : null;
      const theory = result ? (dual ? result.theory : lesson.mostamar) : null;
      return (
        "<tr><td>" +
        esc(lesson.name) +
        "</td><td>" +
        (dual ? (stage === "midterm" ? "میان‌ترم" : "پایان‌ترم") : "—") +
        "</td><td>" +
        esc(practical ?? "—") +
        "</td><td>" +
        esc(theory ?? "—") +
        "</td><td>" +
        (result ? finalText(result) : "—") +
        "</td><td>" +
        esc(
          result
            ? lesson.policy || dual
              ? gradeStatus(
                  stage === "final"
                    ? { ...result, reason: lesson.reason || result.reason }
                    : result,
                )
              : "ثبت نهایی"
            : "ثبت نشده در نسخه قدیمی",
        ) +
        "</td></tr>"
      );
    })
    .join("");
}

async function showFrozenReport(id) {
  const ensureCurrent = preserveAsyncTarget(),
    origin = workspace.id,
    sourceConnection = connection;
  const report = await readRecord("reports", id);
  ensureCurrent();
  if (connection !== sourceConnection)
    throw Error("اتصال بانک هنگام خواندن کارنامه تغییر کرده است.");
  if (!report) throw Error("کارنامه ثابت موجود نیست.");
  if (report.workspace !== origin)
    throw Error("این کارنامه متعلق به ترم انتخاب‌شده نیست.");
  validateFrozenReport(report);
  showModal(
    "کارنامه نهایی ثابت",
    '<div class="frozen-report"><header class="frozen-report-heading"><h2>' +
      esc(report.year + " / " + report.term) +
      "</h2><p>نسخه ثابت ثبت‌شده در " +
      esc(new Date(report.at).toLocaleString("fa-IR")) +
      '</p><button data-workspace-action="print">چاپ / PDF</button></header>' +
      report.classes
        .map(
          (c) =>
            '<section class="frozen-class"><h3>' +
            esc(c.school + " / " + c.name) +
            "</h3>" +
            c.students
              .map(
                (st) =>
                  '<article class="frozen-student"><h4>' +
                  esc(st.name) +
                  '</h4><div class="table-scroll"><table><thead><tr><th>درس</th><th>مرحله</th><th>عملی / پایانی</th><th>نظری / مستمر</th><th>میانگین / نتیجه</th><th>وضعیت</th></tr></thead><tbody>' +
                  st.lessons.map(frozenLessonRows).join("") +
                  '</tbody></table></div><p class="frozen-average">میانگین نهایی: ' +
                  (Number.isFinite(st.average) ? st.average.toFixed(2) : "—") +
                  "</p></article>",
              )
              .join("") +
            "</section>",
        )
        .join("") +
      "</div>",
  );
}

function averageLabel(results) {
  const numeric = results.filter((r) => Number.isFinite(r.final));
  const missing = results.filter(
    (r) => r.complete === false || (r.final == null && r.passed !== false),
  ).length;
  const remedial = results.filter((r) => r.passed === false).length;
  const pending = missing || numeric.length !== results.length;
  const average = numeric.length
    ? numeric.reduce((n, r) => n + r.final, 0) / numeric.length
    : null;
  const details = [
    missing ? missing + " درس با ورود ناقص" : "",
    remedial ? remedial + " درس نیازمند جبران" : "",
  ].filter(Boolean);
  return {
    average,
    missing,
    remedial,
    label:
      (pending ? "میانگین ساده موقت" : "میانگین ساده دروس") +
      (details.length ? " (" + details.join("؛ ") + ")" : ""),
  };
}
function scoreSource(c, l, p, u, sid, field) {
  if (ownScoreRecord(u.unitScores, sid)[field] != null)
    return "ثبت گروهی (اولویت بالاتر)";
  const type = field === "m" ? "mostamar" : "payani";
  const x = db.sessions
    .filter(
      (x) =>
        x.classId === c.id &&
        x.lessonId === l.id &&
        x.poudmanId === p.id &&
        x.unitId === u.id &&
        x.scores.some((sc) => sc.studentId === sid && sc.type === type),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.period - a.period ||
        b.id.localeCompare(a.id),
    )[0];
  return x ? "جلسه " + faDate(x.date) + " / زنگ " + (x.period + 1) : "ثبت نشده";
}

function gradeReportStatus(result, label) {
  const tone =
    result.complete === false ||
    (result.final == null && result.passed !== false)
      ? "pending"
      : result.passed === false
        ? "remedial"
        : result.passed === true
          ? "passed"
          : "complete";
  return (
    '<span class="report-grade-status is-' +
    tone +
    '">' +
    esc(label) +
    "</span>"
  );
}

function assessmentOverviewCell(lesson, sid, parts = null, classId = "") {
  const general = lesson.gradingPolicy?.subjectType === "general";
  const stages = parts
    ? ["اول", "دوم"].flatMap((term) =>
        ["midterm", "final"].map((stage) => ({ term, stage })),
      )
    : ["midterm", "final"].map((stage) => ({ term: "", stage }));
  return (
    '<div class="report-assessment-stages' +
    (general ? " report-assessment-general" : "") +
    '"><div class="report-mobile-score-heading" aria-hidden="true"><span>مرحله</span><div>' +
    (general ? "" : "<span>عملی</span><span>نظری</span>") +
    "<span>نتیجه</span></div></div>" +
    stages
      .map(({ term, stage }) => {
        const source = parts
          ? parts
              .find((part) => part.period.term === term)
              ?.data.schools.flatMap((school) => school.classes)
              .find((classroom) => classroom.id === classId)
              ?.lessons.find((item) => item.id === lesson.id)
          : lesson;
        if (source && parts) assertCompatibleTermLessons(lesson, source);
        const result = source
          ? assessmentResult(source, sid, stage)
          : { practical: null, theory: null, final: null, complete: false };
        return (
          '<div class="report-lesson-stage"><span class="report-stage-title">' +
          (stage === "midterm" ? "میان‌ترم" : "پایان‌ترم") +
          (term ? " " + term : "") +
          '</span><div class="report-stage-values">' +
          (general
            ? ""
            : '<span><span class="report-score-label">عملی</span> <b>' +
              esc(result.practical ?? "—") +
              '</b></span><span><span class="report-score-label">نظری</span> <b>' +
              esc(result.theory ?? "—") +
              "</b></span>") +
          '<span><span class="report-score-label">' +
          (general ? "نمره" : "میانگین") +
          "</span> <strong>" +
          finalText(result) +
          "</strong></span></div></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function karnamehLessons(parts, schoolId, classroom) {
  const lessons = new Map(
    classroom.lessons.map((lesson) => [lesson.id, lesson]),
  );
  for (const part of parts)
    for (const lesson of part.data.schools
      .find((school) => school.id === schoolId)
      ?.classes.find((item) => item.id === classroom.id)?.lessons || [])
      if (!lessons.has(lesson.id)) lessons.set(lesson.id, lesson);
  return [...lessons.values()];
}

// Both live and immutable reports use the same module rows. Older frozen
// reports have results only: absent component inputs stay absent, never inferred.
function modularReportGrades(modules, result) {
  return (
    '<div class="report-modular-grades"><section class="report-modular-course"><div class="report-mobile-score-heading" aria-hidden="true"><span>پودمان</span><div><span>مستمر</span><span>شایستگی</span><span>نتیجه</span></div></div>' +
    modules
      .map(
        (module) =>
          '<div class="report-module-row" data-module-id="' +
          esc(module.id) +
          '"><span class="report-module-title">' +
          esc(module.name) +
          '</span><div class="report-stage-values"><span><span class="report-score-label">مستمر</span><b>' +
          esc(module.inputs?.m ?? "—") +
          '</b></span><span><span class="report-score-label">شایستگی</span><b>' +
          esc(module.inputs?.c ?? "—") +
          '</b></span><span><span class="report-score-label">نتیجه</span><strong>' +
          finalText(module) +
          "</strong></span></div></div>",
      )
      .join("") +
    '<div class="report-modular-final"><span>نهایی درس</span><strong>' +
    finalText(result) +
    "</strong></div></section></div>"
  );
}

function modularOverviewCell(
  lesson,
  sid,
  parts = null,
  classId = "",
  source = db,
) {
  if (lesson.gradingPolicy?.method === "modular") {
    const versions = parts || [{ data: source }];
    const schoolId = versions
      .flatMap((part) => part.data.schools || [])
      .find((school) => school.classes.some((item) => item.id === classId))?.id;
    let annual;
    try {
      annual = parts
        ? annualModularLesson(parts, schoolId, classId, lesson, sid)
        : lesson;
    } catch (error) {
      return (
        '<div class="report-modular-conflict" role="alert">' +
        esc(error.message) +
        "</div>"
      );
    }
    const result = EduPolicy.lesson(annual.gradingPolicy, annual.poudmans, sid);
    return modularReportGrades(
      result.modules.map((module) => ({
        ...module,
        inputs: ownScoreRecord(
          annual.poudmans.find((pod) => pod.id === module.id)?.podScores,
          sid,
        ),
      })),
      result,
    );
  }
  const terms = parts ? ["اول", "دوم"] : [""];
  return (
    '<div class="report-modular-grades">' +
    terms
      .map((term) => {
        const part = parts?.find((item) => item.period.term === term);
        const data = parts ? part?.data : source;
        const classroom = data?.schools
          ?.flatMap((school) => school.classes)
          .find((item) => item.id === classId);
        const currentLesson = parts
          ? classroom?.lessons.find((item) => item.id === lesson.id)
          : lesson;
        const title =
          '<section class="report-modular-term"><h4>' +
          esc("نوبت " + (term || workspace.term)) +
          "</h4>";
        if (!currentLesson)
          return (
            title +
            '<p class="report-modular-empty" aria-label="درس در این نوبت موجود نیست">—</p></section>'
          );
        assertCompatibleTermLessons(lesson, currentLesson);
        const result = calcV24(
          classroom || { id: classId },
          currentLesson,
          sid,
          data,
        );
        const modular = currentLesson.gradingPolicy?.method === "modular";
        const rows = modular
          ? currentLesson.poudmans.map((pod) => {
              const grade = ownScoreRecord(pod.podScores, sid);
              return {
                id: pod.id,
                name: pod.name,
                mostamar: grade.m ?? null,
                second: grade.c ?? null,
                result: result.modules.find((item) => item.id === pod.id) || {
                  final: null,
                },
              };
            })
          : currentLesson.poudmans.flatMap((pod) =>
              pod.units.map((unit) => {
                const grade = result.details?.[pod.id]?.[unit.id] || {};
                return {
                  id: unit.id,
                  name: pod.name + " / " + unit.name,
                  mostamar: grade.m ?? null,
                  second: grade.p ?? null,
                  result: { final: grade.final ?? null },
                };
              }),
            );
        const secondLabel = modular ? "شایستگی" : "پایانی";
        return (
          title +
          '<div class="report-mobile-score-heading" aria-hidden="true"><span>' +
          (modular ? "پودمان" : "پودمان / واحد") +
          "</span><div><span>مستمر</span><span>" +
          secondLabel +
          "</span><span>نتیجه</span></div></div>" +
          (rows.length
            ? rows
                .map(
                  (row) =>
                    '<div class="report-module-row" data-module-id="' +
                    esc(row.id) +
                    '"><span class="report-module-title">' +
                    esc(row.name) +
                    '</span><div class="report-stage-values"><span><span class="report-score-label">مستمر</span><b>' +
                    esc(row.mostamar ?? "—") +
                    '</b></span><span><span class="report-score-label">' +
                    secondLabel +
                    "</span><b>" +
                    esc(row.second ?? "—") +
                    '</b></span><span><span class="report-score-label">نتیجه</span><strong>' +
                    finalText(row.result) +
                    "</strong></span></div></div>",
                )
                .join("")
            : '<p class="report-modular-empty">—</p>') +
          '<div class="report-modular-final"><span>نهایی درس</span><strong>' +
          finalText(result) +
          "</strong></div></section>"
        );
      })
      .join("") +
    "</div>"
  );
}

function overviewV24(c, options = {}) {
  const lessons = c.lessons || [];
  const students = getSortedStudents(
    options.student ? { students: [options.student] } : c,
  );
  if (!lessons.length || !students.length)
    return (
      '<div class="card report-empty" role="status"><h3>کارنامه کلاس ' +
      esc(c.name) +
      "</h3><p>" +
      (!students.length
        ? "هنوز دانش‌آموزی در این کلاس ثبت نشده است."
        : "برای تهیه کارنامه، ابتدا دروس کلاس را اضافه کنید.") +
      "</p></div>"
    );
  return (
    '<div class="card report-document grade-report"><header class="karnameh-report-heading"><div><span class="karnameh-report-kind">نمای کلی کلاس</span><h3>کارنامه کلاس ' +
    esc(c.name) +
    "</h3><p>" +
    esc(
      workspace.year +
        (lessons.every((lesson) => lesson.gradingPolicy?.method === "modular")
          ? ""
          : " / " + workspace.term),
    ) +
    '</p></div><button class="no-print" data-workspace-action="print">چاپ / PDF</button></header><div class="karnameh-report-meta"><span>' +
    students.length.toLocaleString("fa-IR") +
    " هنرجو</span><span>" +
    lessons.length.toLocaleString("fa-IR") +
    " درس</span><span>" +
    (options.parts
      ? lessons.every((lesson) => lesson.gradeMode === "kardanesh")
        ? "۴ مرحلهٔ نمره‌دهی"
        : lessons.every((lesson) => lesson.gradingPolicy?.method === "modular")
          ? "ارزشیابی پودمانی سالانه"
          : "کارنامهٔ سال تحصیلی"
      : lessons.every((lesson) => lesson.gradingPolicy?.method === "modular")
        ? "ارزشیابی پودمانی سالانه"
        : workspace.closed
          ? "نوبت بسته‌شده"
          : "نمرات ثبت‌شده تا این لحظه") +
    '</span></div><div class="table-scroll"><table class="grade-report-table karnameh-overview' +
    (options.parts && lessons.length > 2 ? " karnameh-many-lessons" : "") +
    '" data-mobile-layout="cards"><thead><tr><th scope="col">دانش‌آموز</th>' +
    lessons.map((l) => "<th>" + esc(l.name) + "</th>").join("") +
    "</tr></thead><tbody>" +
    students
      .map((st) => {
        return (
          '<tr><td><button type="button" class="karnameh-student-link no-print" data-workspace-action="karnameh-student" data-class="' +
          esc(c.id) +
          '" data-key="' +
          esc(st.id) +
          '" aria-label="' +
          esc("نمایش کارنامهٔ " + st.name) +
          '">' +
          esc(st.name) +
          '</button><span class="karnameh-student-print">' +
          esc(st.name) +
          "</span></td>" +
          lessons
            .map((lesson) =>
              lesson.gradeMode === "kardanesh"
                ? '<td data-report-lesson="' +
                  esc(lesson.name) +
                  '" class="report-grade-cell report-assessment-cell">' +
                  assessmentOverviewCell(lesson, st.id, options.parts, c.id) +
                  "</td>"
                : '<td data-report-lesson="' +
                  esc(lesson.name) +
                  '" class="report-grade-cell report-assessment-cell report-modular-cell">' +
                  modularOverviewCell(
                    lesson,
                    st.id,
                    options.parts,
                    c.id,
                    options.source || db,
                  ) +
                  "</td>",
            )
            .join("") +
          "</tr>"
        );
      })
      .join("") +
    "</tbody></table></div></div>"
  );
}

const karnamehSnapshots = new WeakMap();
let karnamehRenderGeneration = 0;
async function renderAcademicKarnameh(out, filter) {
  const generation = ++karnamehRenderGeneration;
  const origin = captureWorkspaceContext();
  const current = () =>
    generation === karnamehRenderGeneration &&
    out.isConnected &&
    document.getElementById("karnamehTabOutput") === out &&
    state.view === "reports" &&
    state.reportTab === "karnameh" &&
    workspace.id === origin.id &&
    karnamehFilter.classId === filter.classId &&
    karnamehFilter.studentId === filter.studentId;
  out.innerHTML =
    '<div class="card" role="status">در حال خواندن نمرات نوبت اول و دوم…</div>';
  try {
    const snapshot = await prepareKarnamehSnapshot();
    if (!current()) return;
    const active = snapshot.parts.find((part) => part.period.id === origin.id);
    const school = active.data.schools.find((item) =>
      item.classes.some((classroom) => classroom.id === filter.classId),
    );
    const classroom = school?.classes.find(
      (item) => item.id === filter.classId,
    );
    if (!classroom) throw Error("کلاس در نوبت فعلی موجود نیست.");
    assertAnnualLessonCompatibility(snapshot.parts, school.id, classroom.id);
    const merged = {
      ...classroom,
      lessons: karnamehLessons(snapshot.parts, school.id, classroom),
    };
    const student = filter.studentId
      ? knownStudents(classroom).find((item) => item.id === filter.studentId)
      : null;
    if (filter.studentId && !student)
      throw Error("هنرجو در کلاس انتخاب‌شده موجود نیست.");
    out.innerHTML = overviewV24(merged, {
      parts: snapshot.parts,
      student,
      source: active.data,
    });
    const report = out.querySelector(".report-document");
    if (report) {
      report.classList.add("karnameh-year-document");
      const heading = report.querySelector(".karnameh-report-heading");
      heading.querySelector("h3").textContent = student
        ? "کارنامه " + student.name
        : "کارنامه کلاس " + classroom.name;
      if (student) {
        const title = document.createElement("h2");
        title.textContent = heading.querySelector("h3").textContent;
        heading.querySelector("h3").replaceWith(title);
        const actions = document.createElement("div");
        actions.className = "karnameh-report-actions no-print";
        const back = document.createElement("button");
        back.type = "button";
        back.className = "ghost";
        back.dataset.workspaceAction = "karnameh-student";
        back.dataset.class = classroom.id;
        back.dataset.key = "";
        back.textContent = "نمای کلی کلاس";
        actions.append(back, heading.querySelector("button"));
        heading.append(actions);
      }
      heading.querySelector("p").textContent =
        school.name +
        " · " +
        workspace.year +
        (merged.lessons.every(
          (lesson) => lesson.gradingPolicy?.method === "modular",
        )
          ? ""
          : " · نوبت اول و دوم");
      karnamehSnapshots.set(report, snapshot.context);
    }
  } catch (error) {
    if (current())
      out.innerHTML =
        '<div class="card report-empty" role="alert"><p>' +
        esc(error.message) +
        "</p></div>";
  }
}

function termAssessmentReport(c, lesson, sid = "") {
  const general = lesson.gradingPolicy?.subjectType === "general";
  const weights = assessmentWeights(lesson);
  const students = getSortedStudents(
    sid ? { students: knownStudents(c) } : c,
  ).filter((st) => !sid || st.id === sid);
  let html =
    '<section class="card grade-report-section"><h3>' +
    esc(lesson.name) +
    '</h3><p class="report-term-label">نوبت ' +
    esc(workspace.term) +
    " · " +
    (general
      ? "عمومی · نمره از ۲۰"
      : "عملی " +
        weights.practical.toLocaleString("fa-IR") +
        "٪ · نظری " +
        weights.theory.toLocaleString("fa-IR") +
        "٪ · نتیجهٔ وزنی از ۲۰") +
    "</p>";
  if (!students.length)
    return (
      html + '<div class="empty">دانش‌آموزی برای نمایش نیست.</div></section>'
    );
  html +=
    '<div class="table-scroll"><table class="grade-report-table"><thead><tr><th scope="col">دانش‌آموز</th><th scope="col">مرحله</th>' +
    (general ? "" : '<th scope="col">عملی</th><th scope="col">نظری</th>') +
    '<th scope="col">' +
    (general ? "نمره" : "میانگین وزنی") +
    '</th><th scope="col">وضعیت</th></tr></thead><tbody>';
  for (const st of students)
    for (const stage of ["midterm", "final"]) {
      const r = assessmentResult(lesson, st.id, stage);
      html +=
        "<tr><td>" +
        esc(st.name) +
        "</td><td>" +
        (stage === "midterm" ? "میان‌ترم" : "پایان‌ترم") +
        "</td>" +
        (general
          ? ""
          : "<td>" +
            esc(r.practical ?? "—") +
            "</td><td>" +
            esc(r.theory ?? "—") +
            "</td>") +
        "<td><strong>" +
        finalText(r) +
        "</strong></td><td>" +
        gradeReportStatus(r, gradeStatus(r)) +
        "</td></tr>";
    }
  return html + "</tbody></table></div></section>";
}

function detailedV24(c, sid) {
  const st = getStudentObj(c, sid);
  if (!st) return '<div class="card">دانش‌آموز یافت نشد.</div>';
  const lessons = c.lessons || [],
    stats = lessons.map((l) => calcV24(c, l, sid)),
    mean = averageLabel(stats);
  if (!lessons.length)
    return (
      '<div class="card report-empty" role="status"><h3>کارنامه ' +
      esc(st.name) +
      "</h3><p>هنوز درسی برای این کلاس ثبت نشده است.</p></div>"
    );
  let html =
    '<div class="card report-document grade-report"><header class="karnameh-report-heading"><div><span class="karnameh-report-kind">کارنامه هنرجو</span><h2>کارنامه ' +
    esc(st.name) +
    "</h2><p>کلاس " +
    esc(c.name) +
    " | " +
    esc(workspace.year + " / " + workspace.term) +
    " | " +
    (workspace.closed ? "ترم بسته" : "گزارش در حال کار") +
    '</p></div><div class="karnameh-report-actions no-print"><button type="button" class="ghost" data-workspace-action="karnameh-student" data-class="' +
    esc(c.id) +
    '" data-key="">نمای کلی کلاس</button><button data-workspace-action="print">چاپ / PDF</button></div></header><div class="table-scroll"><table class="grade-report-table karnameh-individual"><thead><tr><th>درس</th><th>عملی / پایانی</th><th>تئوری / مستمر</th><th>نتیجه پایان‌ترم / درس</th><th>وضعیت</th><th>حضور و غیاب</th></tr></thead><tbody>' +
    lessons
      .map((l, i) => {
        const r = stats[i];
        return (
          "<tr><td>" +
          esc(l.name) +
          "</td><td>" +
          ((l.gradeMode === "kardanesh" ? r.practical : r.avgP) ?? "—") +
          "</td><td>" +
          ((l.gradeMode === "kardanesh" ? r.theory : r.avgM) ?? "—") +
          '</td><td class="report-final-cell"><strong>' +
          finalText(r) +
          "</strong></td><td>" +
          gradeReportStatus(
            r,
            l.gradingPolicy || l.gradeMode === "kardanesh"
              ? gradeStatus(r)
              : r.final === null
                ? "ناقص"
                : "تکمیل",
          ) +
          '</td><td><div class="report-attendance-counts"><span class="is-present">حاضر <b>' +
          ((r.att.present || 0) + (r.att.late || 0)) +
          '</b></span><span class="is-absent">غایب <b>' +
          r.att.absent +
          '</b></span><span class="is-late">تأخیر <b>' +
          r.att.late +
          '</b></span><span class="is-leave">مرخصی <b>' +
          (r.att.leave || 0) +
          "</b></span></div></td></tr>"
        );
      })
      .join("") +
    "</tbody></table></div><p><b>" +
    esc(mean.label) +
    ": " +
    (mean.average === null ? "—" : mean.average.toFixed(2)) +
    "</b></p>";
  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i],
      r = stats[i];
    if (l.gradeMode === "kardanesh") {
      html += termAssessmentReport(c, l, sid);
      continue;
    }
    if (l.gradingPolicy) {
      html += courseUI.table(c, l, sid, false);
      continue;
    }
    html +=
      "<h3>" +
      esc(l.name) +
      "</h3><p>نمره گروهی بر جلسه اولویت دارد. هر واحد با وزن‌های مستمر " +
      l.weightMostamar +
      "٪ و پایانی " +
      l.weightPayani +
      "٪ محاسبه می‌شود.</p><table><thead><tr><th>پودمان / واحد</th><th>مستمر و منبع</th><th>پایانی و منبع</th><th>نهایی واحد</th></tr></thead><tbody>" +
      l.poudmans
        .map((p) =>
          p.units
            .map((u) => {
              const d = r.details[p.id][u.id];
              return (
                "<tr><td>" +
                esc(p.name + " / " + u.name) +
                "</td><td>" +
                (d.m ?? "—") +
                "<br>" +
                esc(scoreSource(c, l, p, u, sid, "m")) +
                "</td><td>" +
                (d.p ?? "—") +
                "<br>" +
                esc(scoreSource(c, l, p, u, sid, "p")) +
                "</td><td>" +
                finalText(d) +
                "</td></tr>"
              );
            })
            .join(""),
        )
        .join("") +
      "</tbody></table>";
  }
  return html + "</div>";
}

function parentReportV24(st, c) {
  let text =
    "کارنامه " +
    st.name +
    "\n" +
    workspace.year +
    " / " +
    workspace.term +
    "\nکلاس " +
    c.name +
    "\n";
  for (const l of c.lessons) {
    const r = calcV24(c, l, st.id);
    text +=
      "\n" +
      l.name +
      "\n" +
      (l.gradeMode === "kardanesh"
        ? ["midterm", "final"]
            .map((stage) => {
              const result = assessmentResult(l, st.id, stage);
              return (
                (stage === "midterm" ? "میان‌ترم" : "پایان‌ترم") +
                " نوبت " +
                workspace.term +
                ": " +
                (l.gradingPolicy?.subjectType === "general"
                  ? ""
                  : "عملی " +
                    (result.practical ?? "—") +
                    " | نظری " +
                    (result.theory ?? "—") +
                    " | ") +
                finalText(result) +
                " — " +
                gradeStatus(result)
              );
            })
            .join("\n")
        : l.gradingPolicy?.method === "modular"
          ? r.modules
              .map(
                (p) => p.name + ": " + finalText(p) + " / " + policyStatus(p),
              )
              .join(" | ")
          : "مستمر " + (r.avgM ?? "—") + " | پایانی " + (r.avgP ?? "—")) +
      "\nنهایی " +
      finalText(r) +
      (l.gradingPolicy || l.gradeMode === "kardanesh"
        ? " | " + gradeStatus(r)
        : "") +
      "\nحاضر " +
      ((r.att.present || 0) + (r.att.late || 0)) +
      " | غایب " +
      r.att.absent +
      " | مرخصی " +
      (r.att.leave || 0) +
      " | تأخیر " +
      r.att.late +
      "\n";
  }
  const mean = averageLabel(c.lessons.map((l) => calcV24(c, l, st.id)));
  return (
    text +
    "\n" +
    mean.label +
    ": " +
    (mean.average === null ? "—" : mean.average.toFixed(2))
  );
}
