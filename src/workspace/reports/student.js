function validateFrozenReport(report) {
  return EduFrozenReportValidator.validate(report, {
    assertSafeDataTree,
    isDataObject,
    isSafeRecordId,
    weightedKardanesh,
  });
}

async function showFrozenReport(id) {
  const report = await readRecord("reports", id);
  if (!report) throw Error("کارنامه ثابت موجود نیست.");
  validateFrozenReport(report);
  showModal(
    "کارنامه نهایی ثابت",
    "<h2>" +
      esc(report.year + " / " + report.term) +
      "</h2><p>نسخه ثابت ثبت‌شده در " +
      esc(new Date(report.at).toLocaleString("fa-IR")) +
      '</p><button data-workspace-action="print">چاپ / PDF</button>' +
      report.classes
        .map(
          (c) =>
            "<h3>" +
            esc(c.school + " / " + c.name) +
            "</h3>" +
            c.students
              .map(
                (st) =>
                  "<h4>" +
                  esc(st.name) +
                  "</h4><table><thead><tr><th>درس</th><th>عملی / پایانی</th><th>تئوری / مستمر</th><th>میان‌ترم کاردانش</th><th>پایان‌ترم / نتیجه درس</th><th>وضعیت</th></tr></thead><tbody>" +
                  st.lessons
                    .map(
                      (l) =>
                        "<tr><td>" +
                        esc(l.name) +
                        "</td><td>" +
                        esc(
                          (l.mode === "kardanesh" ? l.practical : l.payani) ??
                            "—",
                        ) +
                        "</td><td>" +
                        esc(
                          (l.mode === "kardanesh" ? l.theory : l.mostamar) ??
                            "—",
                        ) +
                        "</td><td>" +
                        (l.mode === "kardanesh"
                          ? l.assessments
                            ? finalText(l.assessments.midterm) +
                              "<small> عملی " +
                              esc(l.assessments.midterm.practical) +
                              " · تئوری " +
                              esc(l.assessments.midterm.theory) +
                              "</small>"
                            : "ثبت نشده در نسخه قدیمی"
                          : "—") +
                        "</td><td>" +
                        finalText(l) +
                        "</td><td>" +
                        esc(
                          l.policy || l.mode === "kardanesh"
                            ? gradeStatus(l)
                            : "ثبت نهایی",
                        ) +
                        "</td></tr>",
                    )
                    .join("") +
                  "</tbody></table><p>میانگین نهایی: " +
                  (Number.isFinite(st.average) ? st.average.toFixed(2) : "—") +
                  "</p>",
              )
              .join(""),
        )
        .join(""),
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

function overviewV24(c) {
  const lessons = c.lessons || [];
  return (
    '<div class="card"><h3>کارنامه کلاس ' +
    esc(c.name) +
    "</h3><p>" +
    esc(workspace.year + " / " + workspace.term) +
    '</p><button class="no-print" data-workspace-action="print">چاپ / PDF</button><div class="table-scroll"><table><thead><tr><th>دانش‌آموز</th>' +
    lessons.map((l) => "<th>" + esc(l.name) + "</th>").join("") +
    "<th>میانگین و وضعیت تکمیل</th></tr></thead><tbody>" +
    getSortedStudents(c)
      .map((st) => {
        const results = lessons.map((l) => calcV24(c, l, st.id)),
          mean = averageLabel(results);
        return (
          "<tr><td>" +
          esc(st.name) +
          "</td>" +
          results
            .map(
              (r, i) =>
                "<td>" +
                finalText(r) +
                (lessons[i].gradingPolicy ||
                lessons[i].gradeMode === "kardanesh"
                  ? " · " + gradeStatus(r)
                  : r.final === null
                    ? " · ناقص"
                    : "") +
                "</td>",
            )
            .join("") +
          "<td>" +
          (mean.average === null ? "—" : mean.average.toFixed(2)) +
          "<br>" +
          esc(mean.label) +
          "</td></tr>"
        );
      })
      .join("") +
    "</tbody></table></div></div>"
  );
}

function detailedV24(c, sid) {
  const st = getStudentObj(c, sid);
  if (!st) return '<div class="card">دانش‌آموز یافت نشد.</div>';
  const lessons = c.lessons || [],
    stats = lessons.map((l) => calcV24(c, l, sid)),
    mean = averageLabel(stats);
  let html =
    '<div class="card report-document"><h2>کارنامه ' +
    esc(st.name) +
    "</h2><p>کلاس " +
    esc(c.name) +
    " | " +
    esc(workspace.year + " / " + workspace.term) +
    " | " +
    (workspace.closed ? "دوره بسته" : "گزارش در حال کار") +
    '</p><button class="no-print" data-workspace-action="print">چاپ / PDF</button><div class="table-scroll"><table><thead><tr><th>درس</th><th>عملی / پایانی</th><th>تئوری / مستمر</th><th>نهایی</th><th>وضعیت</th><th>حاضر / غایب / تأخیر</th></tr></thead><tbody>' +
    lessons
      .map((l, i) => {
        const r = stats[i];
        return (
          "<tr><td>" +
          esc(l.name) +
          "</td><td>" +
          (r.avgP ?? "—") +
          "</td><td>" +
          (r.avgM ?? "—") +
          "</td><td>" +
          finalText(r) +
          "</td><td>" +
          (l.gradingPolicy || l.gradeMode === "kardanesh"
            ? gradeStatus(r)
            : r.final === null
              ? "ناقص"
              : "تکمیل") +
          "</td><td>" +
          r.att.present +
          " / " +
          r.att.absent +
          " / " +
          r.att.late +
          "</td></tr>"
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
    if (l.gradingPolicy) {
      html += courseUI.table(c, l, sid, false);
      continue;
    }
    if (l.gradeMode === "kardanesh") {
      html += buildKardaneshSummary(c, l, sid);
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
        ? "عملی " + (r.practical ?? "—") + " | تئوری " + (r.theory ?? "—")
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
      r.att.present +
      " | غایب " +
      r.att.absent +
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
