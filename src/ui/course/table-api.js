function table(c, l, sid, editable = false) {
  const policy = l.gradingPolicy;
  if (!policy) return "";
  const students = api
    .students(sid ? { students: api.knownStudents(c) } : c)
    .filter((s) => !sid || s.id === sid);
  let h =
    '<div class="card course-grades"><h3>' +
    esc(l.name) +
    "</h3><p>" +
    esc(P.describe(l)) +
    "</p><p>ابلاغیه " +
    esc(policy.circularNumber || "ثبت نشده") +
    " | " +
    esc(policy.circularDate) +
    " | " +
    esc(policy.reference) +
    "</p><p>حضور و امتیازهای جلسه به نمره رسمی اضافه نمی‌شوند.</p>";
  if (!policy.confirmed)
    h +=
      '<p class="course-warning">نتایج براساس قواعد پیش‌نویس هستند؛ پیش از بستن کارنامه، قواعد را با ابلاغیه تطبیق دهید.</p>';
  if (editable)
    h +=
      '<div class="grades-intro"><span>ثبت نمرات رسمی</span><p>نمره هر دانش‌آموز را در ستون مربوط وارد کنید؛ وضعیت ذخیره زیر هر ورودی نمایش داده می‌شود.</p><small>' +
      students.length.toLocaleString("fa-IR") +
      " دانش‌آموز</small></div>";
  if (!students.length)
    return (
      h +
      '<div class="empty"><strong>دانش‌آموزی برای نمایش نیست</strong><p>برای ثبت نمره، ابتدا اعضای کلاس را از تب دانش‌آموزان اضافه کنید.</p></div></div>'
    );
  if (policy.subjectType === "general") {
    h += '<div class="table-scroll"><table><thead><tr><th>دانش‌آموز</th><th>نمره از ۲۰</th><th>وضعیت</th></tr></thead><tbody>';
    for (const st of students) {
      const r = api.calc(c, l, st.id);
      h += '<tr><td>' + esc(st.name) + '</td><td>' +
        (editable ? api.gradeCell(c, l, st, "theory", { value: r.theory }) : api.finalText(r)) +
        '</td><td>' + esc(api.status(r)) + '</td></tr>';
    }
    return h + '</tbody></table></div></div>';
  }
  if (policy.method === "dual") {
    h +=
      '<div class="table-scroll"><table><thead><tr><th>هنرجو</th><th>عملی</th><th>نظری</th><th>نهایی</th><th>نتیجه و دلیل</th></tr></thead><tbody>';
    for (const st of students) {
      const r = api.calc(c, l, st.id);
      h +=
        "<tr><td>" +
        esc(st.name) +
        "</td><td>" +
        (editable
          ? api.gradeCell(c, l, st, "practical", {
              value: r.practical,
            })
          : (r.practical ?? "—")) +
        "</td><td>" +
        (editable
          ? api.gradeCell(c, l, st, "theory", { value: r.theory })
          : (r.theory ?? "—")) +
        '</td><td data-kfinal="' +
        st.id +
        '">' +
        api.finalText(r) +
        '</td><td data-kstatus="' +
        st.id +
        '">' +
        esc(api.status(r)) +
        "</td></tr>";
    }
    return h + "</tbody></table></div></div>";
  }
  for (const pod of l.poudmans) {
    h +=
      "<h4>" +
      esc(pod.name) +
      "</h4><p>" +
      pod.units.map((u) => esc(u.name)).join(" / ") +
      '</p><div class="table-scroll"><table><thead><tr><th>هنرجو</th><th>مستمر از ' +
      policy.mostamarMax +
      "</th><th>شایستگی ۱ / ۲ / ۳</th>" +
      (policy.requireGate ? "<th>معیارهای الزامی و ایمنی</th>" : "") +
      "<th>نمره پودمان</th><th>نتیجه و دلیل</th></tr></thead><tbody>";
    for (const st of students) {
      const g = ownScoreRecord(pod.podScores, st.id),
        r = P.moduleResult(policy, g);
      h +=
        `<tr><td>${esc(st.name)}</td><td>` +
        (editable
          ? api.gradeCell(c, l, st, "m", {
              kind: "pod",
              pid: pod.id,
              value: g.m,
            })
          : (g.m ?? "—")) +
        "</td><td>" +
        (editable
          ? api.gradeCell(c, l, st, "c", {
              kind: "pod",
              pid: pod.id,
              value: g.c,
            })
          : (g.c ?? "—")) +
        "</td>";
      if (policy.requireGate)
        h +=
          "<td>" +
          (editable
            ? `<select aria-label="معیارهای الزامی ${esc(st.name)}" data-course-gate data-lesson-id="${esc(l.id)}" data-pod-id="${esc(pod.id)}" data-student-id="${esc(st.id)}"><option value="" ${g.gate == null ? "selected" : ""}>بررسی نشده</option><option value="yes" ${g.gate === true ? "selected" : ""}>احراز شده</option><option value="no" ${g.gate === false ? "selected" : ""}>احراز نشده</option></select>`
            : g.gate === true
              ? "احراز شده"
              : g.gate === false
                ? "احراز نشده"
                : "بررسی نشده") +
          "</td>";
      h += `<td data-pod-final="${pod.id}|${st.id}">${api.finalText(r)}</td><td data-pod-status="${pod.id}|${st.id}">${esc(api.status(r))}</td></tr>`;
    }
    h += "</tbody></table></div>";
  }
  h +=
    "<h4>نتیجه درس</h4><table><thead><tr><th>هنرجو</th><th>نهایی قابل ثبت</th><th>میانگین محاسباتی</th><th>وضعیت</th></tr></thead><tbody>";
  for (const st of students) {
    const r = api.calc(c, l, st.id);
    h += `<tr><td>${esc(st.name)}</td><td data-course-final="${l.id}|${st.id}">${api.finalText(r)}</td><td data-course-mean="${l.id}|${st.id}">${r.provisionalAverage == null ? "—" : r.provisionalAverage.toFixed(2)}</td><td data-course-status="${l.id}|${st.id}">${esc(api.status(r))}</td></tr>`;
  }
  return h + "</tbody></table></div>";
}
installCourseTableEvents();
return {
  open,
  openNames,
  save,
  add,
  copy,
  gate,
  table,
  toggleMethod,
  toggleBranch,
  error,
};
