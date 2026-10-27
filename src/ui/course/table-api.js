const selectedGradeModules = new Map();
function moduleSelectionKey(c, l) {
  return JSON.stringify([api.context().id, c.id, l.id]);
}
function selectGradeModule(control) {
  const root = control.closest(".modular-gradebook");
  if (!root) return;
  const panels = [...root.querySelectorAll("[data-module-panel]")];
  if (!panels.some((panel) => panel.dataset.modulePanel === control.value)) return;
  selectedGradeModules.set(root.dataset.moduleSelectionKey, control.value);
  for (const panel of panels) panel.hidden = panel.dataset.modulePanel !== control.value;
  const search = root.querySelector("[data-assessment-search]");
  search.value = "";
  for (const row of root.querySelectorAll("[data-assessment-name]")) row.hidden = false;
  root.querySelector(".gradebook-no-results").hidden = true;
}
function modularGradebook(c, l, students) {
  const key = moduleSelectionKey(c, l);
  const selected = l.poudmans.find((p) => p.id === selectedGradeModules.get(key)) || l.poudmans[0];
  const policy = l.gradingPolicy;
  let h = '<div class="card gradebook modular-gradebook" data-module-selection-key="' + esc(key) + '"><header class="gradebook-heading"><div><span class="gradebook-eyebrow">دفتر نمره پودمانی</span><h3>' + esc(l.name) + '</h3><p>ثبت نمره هر پودمان، مستقل از پودمان‌های دیگر</p></div><span class="gradebook-class-count">' + students.length.toLocaleString("fa-IR") + ' دانش‌آموز</span></header>';
  h += '<div class="module-toolbar"><label class="module-picker"><span>انتخاب پودمان</span><select data-module-picker>' + l.poudmans.map((pod, index) => '<option value="' + esc(pod.id) + '"' + (pod.id === selected?.id ? ' selected' : '') + '>' + (index + 1).toLocaleString("fa-IR") + ' · ' + esc(pod.name) + '</option>').join("") + '</select></label><label class="gradebook-search"><span>جست‌وجوی دانش‌آموز</span><input type="search" data-assessment-search="" placeholder="نام دانش‌آموز…" autocomplete="off"></label></div>';
  h += '<details class="gradebook-help"><summary>راهنمای نمره و شایستگی</summary><p>' + esc(P.describe(l)) + ' · حضور و فعالیت جلسه به نمره رسمی اضافه نمی‌شود.</p></details>';
  if (!policy.confirmed) h += '<p class="module-policy-notice">قواعد این درس هنوز تأیید نشده‌اند؛ نتیجه‌ها پیش‌نویس‌اند.</p>';
  if (!students.length) h += '<div class="empty">ابتدا دانش‌آموزان کلاس را اضافه کنید.</div>';
  for (const pod of l.poudmans) {
    h += '<section class="module-panel" data-module-panel="' + esc(pod.id) + '" aria-label="' + esc(pod.name) + '"' + (pod.id === selected?.id ? '' : ' hidden') + '><details class="module-units"><summary>واحدهای یادگیری این پودمان</summary><p>' + pod.units.map((u) => esc(u.name)).join(" · ") + '</p></details><div class="assessment-students">';
    for (const [index, st] of students.entries()) {
      const score = ownScoreRecord(pod.podScores, st.id);
      const result = P.moduleResult(policy, score);
      h += '<article class="assessment-student" data-assessment-name="' + esc(st.name) + '"><div class="gradebook-student"><span class="gradebook-number" aria-hidden="true">' + (index + 1).toLocaleString("fa-IR") + '</span><h4>' + esc(st.name) + '</h4></div><div class="assessment-inputs"><label><span>مستمر <small>از ' + policy.mostamarMax.toLocaleString("fa-IR") + '</small></span>' + api.gradeCell(c, l, st, "m", { kind: "pod", pid: pod.id, value: score.m }) + '</label><label><span>شایستگی <small>۱، ۲ یا ۳</small></span>' + api.gradeCell(c, l, st, "c", { kind: "pod", pid: pod.id, value: score.c }) + '</label></div><div class="gradebook-result"><span>نمره پودمان</span><strong data-pod-final="' + esc(pod.id + "|" + st.id) + '">' + api.finalText(result) + '</strong><span data-pod-status="' + esc(pod.id + "|" + st.id) + '">' + esc(api.status(result)) + '</span></div>';
      if (policy.requireGate)
        h += '<label class="module-gate"><span>معیارهای الزامی و ایمنی</span><select aria-label="معیارهای الزامی ' + esc(st.name) + '" data-course-gate data-lesson-id="' + esc(l.id) + '" data-pod-id="' + esc(pod.id) + '" data-student-id="' + esc(st.id) + '"><option value=""' + (score.gate == null ? ' selected' : '') + '>بررسی نشده</option><option value="yes"' + (score.gate === true ? ' selected' : '') + '>احراز شده</option><option value="no"' + (score.gate === false ? ' selected' : '') + '>احراز نشده</option></select></label>';
      h += '</article>';
    }
    h += '</div></section>';
  }
  h += '<p class="gradebook-no-results" role="status" hidden>دانش‌آموزی با این نام پیدا نشد.</p><details class="module-overview"><summary>خلاصه نتیجه کل درس</summary><div class="table-scroll"><table><thead><tr><th>دانش‌آموز</th><th>نهایی قابل ثبت</th><th>میانگین محاسباتی</th><th>وضعیت</th></tr></thead><tbody>';
  for (const st of students) {
    const r = api.calc(c, l, st.id);
    h += '<tr><td>' + esc(st.name) + '</td><td data-course-final="' + esc(l.id + "|" + st.id) + '">' + api.finalText(r) + '</td><td data-course-mean="' + esc(l.id + "|" + st.id) + '">' + (r.provisionalAverage == null ? "—" : r.provisionalAverage.toFixed(2)) + '</td><td data-course-status="' + esc(l.id + "|" + st.id) + '">' + esc(api.status(r)) + '</td></tr>';
  }
  return h + '</tbody></table></div></details></div>';
}
function table(c, l, sid, editable = false) {
  const policy = l.gradingPolicy;
  if (!policy) return "";
  const students = api
    .students(sid ? { students: api.knownStudents(c) } : c)
    .filter((s) => !sid || s.id === sid);
  if (editable && policy.method === "modular") return modularGradebook(c, l, students);
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
