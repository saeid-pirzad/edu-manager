function policyStatus(r) {
  if (r.complete === false && r.final == null && r.passed !== false)
    return r.reason || "در انتظار ثبت نمره";
  let label =
    r.passed === false
      ? "نیازمند جبران"
      : r.final == null
        ? "ناقص"
        : r.passed === true
          ? "قبول"
          : "تکمیل";
  if (r.reason) label += " — " + r.reason;
  if (r.policyConfirmed === false) label += " (قواعد پیش‌نویس)";
  return label;
}

function refreshPolicyResults() {
  const c = findClass(state.classId);
  if (!c) return;
  for (const el of document.querySelectorAll(
    "[data-pod-final],[data-pod-status]",
  )) {
    const key = el.dataset.podFinal || el.dataset.podStatus,
      [pid, sid] = key.split("|");
    const l = c.lessons.find((l) => l.poudmans.some((p) => p.id === pid)),
      pod = l?.poudmans.find((p) => p.id === pid);
    if (!l?.gradingPolicy) continue;
    const r = EduPolicy.moduleResult(
      l.gradingPolicy,
      ownScoreRecord(pod.podScores, sid),
    );
    el.textContent = el.dataset.podFinal ? finalText(r) : policyStatus(r);
    const row = el.closest(".assessment-student");
    if (row)
      row.dataset.resultState = !r.complete
        ? "incomplete"
        : r.passed
          ? "passed"
          : "review";
  }
  for (const el of document.querySelectorAll(
    "[data-course-final],[data-course-mean],[data-course-status]",
  )) {
    const key =
        el.dataset.courseFinal ||
        el.dataset.courseMean ||
        el.dataset.courseStatus,
      [lid, sid] = key.split("|"),
      l = getLessonObj(c, lid);
    if (!l) continue;
    const r = calcV24(c, l, sid);
    el.textContent = el.dataset.courseFinal
      ? finalText(r)
      : el.dataset.courseMean
        ? r.provisionalAverage == null
          ? "—"
          : r.provisionalAverage.toFixed(2)
        : policyStatus(r);
  }
}
