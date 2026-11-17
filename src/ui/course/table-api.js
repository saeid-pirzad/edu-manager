const selectedGradeModules = new Map();
const selectedGradeUnits = new Map();
function moduleSelectionKey(c, l) {
  return JSON.stringify([api.context().id, c.id, l.id]);
}
function selectGradeModule(control) {
  const root = control.closest(".modular-gradebook");
  if (!root) return;
  const panels = [...root.querySelectorAll("[data-module-panel]")];
  if (!panels.some((panel) => panel.dataset.modulePanel === control.value))
    return;
  selectedGradeModules.set(root.dataset.moduleSelectionKey, control.value);
  for (const panel of panels)
    panel.hidden = panel.dataset.modulePanel !== control.value;
  for (const picker of root.querySelectorAll("[data-unit-picker]"))
    picker.hidden = picker.dataset.unitModule !== control.value;
  resetGradeSearch(root);
}
function resetGradeSearch(root) {
  const search = root.querySelector("[data-assessment-search]");
  search.value = "";
  for (const row of root.querySelectorAll("[data-assessment-name]"))
    row.hidden = false;
  root.querySelector(".gradebook-no-results").hidden = true;
}
function selectGradeUnit(control) {
  const root = control.closest(".modular-gradebook");
  if (!root) return;
  const module = [...root.querySelectorAll("[data-module-panel]")].find(
    (panel) => panel.dataset.modulePanel === control.dataset.unitModule,
  );
  if (!module) return;
  const panels = [...module.querySelectorAll("[data-unit-panel]")];
  if (!panels.some((panel) => panel.dataset.unitPanel === control.value))
    return;
  selectedGradeUnits.set(
    root.dataset.moduleSelectionKey + "|" + control.dataset.unitModule,
    control.value,
  );
  for (const panel of panels)
    panel.hidden = panel.dataset.unitPanel !== control.value;
  resetGradeSearch(root);
}
function modularStudent(c, l, st, pod, unit) {
  const policy = l.gradingPolicy;
  const score = ownScoreRecord(
    unit ? unit.competencyScores : pod.podScores,
    st.id,
  );
  const result = P.moduleResult(policy, score);
  const kind = unit ? "unit" : "pod";
  const resultKey = esc([pod.id, ...(unit ? [unit.id] : []), st.id].join("|"));
  return (
    '<article class="assessment-student" data-result-state="' +
    (!result.complete ? "incomplete" : result.passed ? "passed" : "review") +
    '" data-assessment-name="' +
    esc(st.name) +
    '"><div class="gradebook-student"><h4 title="' +
    esc(st.name) +
    '">' +
    esc(st.name) +
    '</h4></div><div class="assessment-inputs"><label><span>مستمر <small>از ' +
    policy.mostamarMax.toLocaleString("fa-IR") +
    "</small></span>" +
    api.gradeCell(c, l, st, "m", {
      kind,
      pid: pod.id,
      ...(unit ? { uid: unit.id } : {}),
      value: score.m,
    }) +
    "</label><label><span>شایستگی <small>۱، ۲ یا ۳</small></span>" +
    api.gradeCell(c, l, st, "c", {
      kind,
      pid: pod.id,
      ...(unit ? { uid: unit.id } : {}),
      value: score.c,
    }) +
    '</label></div><div class="gradebook-result"><span>' +
    (unit ? "نمره واحد کار" : "نمره پودمان") +
    "</span><strong data-" +
    kind +
    '-final="' +
    resultKey +
    '">' +
    api.finalText(result) +
    "</strong><span data-" +
    kind +
    '-status="' +
    resultKey +
    '">' +
    esc(api.status(result)) +
    "</span></div></article>"
  );
}
function modularGradebook(c, l, students) {
  const key = moduleSelectionKey(c, l);
  const selected =
    l.poudmans.find((p) => p.id === selectedGradeModules.get(key)) ||
    l.poudmans[0];
  const policy = l.gradingPolicy;
  const unitBased = P.unitBased(policy);
  let h =
    '<div class="card gradebook modular-gradebook module-simple' +
    (unitBased ? " unit-gradebook" : "") +
    '" data-module-selection-key="' +
    esc(key) +
    '"><header class="module-simple-heading"><h3>' +
    esc(l.name) +
    "</h3>" +
    "</header>";
  h +=
    '<div class="module-toolbar"><select data-module-picker aria-label="انتخاب پودمان">' +
    l.poudmans
      .map(
        (pod, index) =>
          '<option value="' +
          esc(pod.id) +
          '"' +
          (pod.id === selected?.id ? " selected" : "") +
          ">" +
          (index + 1).toLocaleString("fa-IR") +
          " · " +
          esc(pod.name) +
          "</option>",
      )
      .join("") +
    "</select>";
  if (unitBased)
    for (const pod of l.poudmans) {
      const selectedUnit =
        pod.units.find(
          (unit) => unit.id === selectedGradeUnits.get(key + "|" + pod.id),
        ) || pod.units[0];
      h +=
        '<select data-unit-picker data-unit-module="' +
        esc(pod.id) +
        '" aria-label="انتخاب واحد کار در ' +
        esc(pod.name) +
        '"' +
        (pod.id === selected?.id ? "" : " hidden") +
        ">" +
        pod.units
          .map(
            (unit, index) =>
              '<option value="' +
              esc(unit.id) +
              '"' +
              (unit.id === selectedUnit?.id ? " selected" : "") +
              ">" +
              (index + 1).toLocaleString("fa-IR") +
              " · " +
              esc(unit.name) +
              "</option>",
          )
          .join("") +
        "</select>";
    }
  h +=
    '<input type="search" data-assessment-search="" aria-label="جست‌وجوی دانش‌آموز" placeholder="جست‌وجوی دانش‌آموز…" autocomplete="off"></div>';
  if (unitBased)
    h +=
      '<p class="unit-gradebook-hint">نمرات هر واحد کار مستقل ثبت می‌شوند.</p>';
  if (!students.length)
    h += '<div class="empty">ابتدا دانش‌آموزان کلاس را اضافه کنید.</div>';
  for (const pod of l.poudmans) {
    h +=
      '<section class="module-panel" data-module-panel="' +
      esc(pod.id) +
      '" aria-label="' +
      esc(pod.name) +
      '"' +
      (pod.id === selected?.id ? "" : " hidden") +
      ">";
    if (unitBased) {
      const selectedUnit =
        pod.units.find(
          (unit) => unit.id === selectedGradeUnits.get(key + "|" + pod.id),
        ) || pod.units[0];
      for (const unit of pod.units) {
        h +=
          '<section data-unit-panel="' +
          esc(unit.id) +
          '" aria-label="' +
          esc(unit.name) +
          '"' +
          (unit.id === selectedUnit?.id ? "" : " hidden") +
          '><h4 class="unit-gradebook-title">' +
          esc(pod.name + " · " + unit.name) +
          '</h4><div class="assessment-students">' +
          students.map((st) => modularStudent(c, l, st, pod, unit)).join("") +
          "</div></section>";
      }
    } else
      h +=
        '<div class="assessment-students">' +
        students.map((st) => modularStudent(c, l, st, pod)).join("") +
        "</div>";
    h += "</section>";
  }
  return (
    h +
    '<p class="gradebook-no-results" role="status" hidden>دانش‌آموزی با این نام پیدا نشد.</p></div>'
  );
}

function table(c, l, sid, editable = false) {
  const policy = l.gradingPolicy;
  if (!policy) return "";
  const students = api
    .students(sid ? { students: api.knownStudents(c) } : c)
    .filter((s) => !sid || s.id === sid);
  if (editable && policy.method === "modular")
    return modularGradebook(c, l, students);
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
    h +=
      '<div class="table-scroll"><table><thead><tr><th>دانش‌آموز</th><th>نمره از ۲۰</th><th>وضعیت</th></tr></thead><tbody>';
    for (const st of students) {
      const r = api.calc(c, l, st.id);
      h +=
        "<tr><td>" +
        esc(st.name) +
        "</td><td>" +
        (editable
          ? api.gradeCell(c, l, st, "theory", { value: r.theory })
          : api.finalText(r)) +
        "</td><td>" +
        esc(api.status(r)) +
        "</td></tr>";
    }
    return h + "</tbody></table></div></div>";
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
  if (P.unitBased(policy)) {
    for (const pod of l.poudmans) {
      h += '<section class="unit-report-module"><h4>' + esc(pod.name) + "</h4>";
      for (const unit of pod.units) {
        h +=
          "<h5>" +
          esc(unit.name) +
          '</h5><div class="table-scroll"><table><thead><tr><th>هنرجو</th><th>مستمر از ' +
          policy.mostamarMax +
          "</th><th>شایستگی ۱ / ۲ / ۳</th><th>نمره واحد کار</th><th>نتیجه و دلیل</th></tr></thead><tbody>";
        for (const st of students) {
          const score = ownScoreRecord(unit.competencyScores, st.id);
          const result = P.moduleResult(policy, score);
          const key = esc([pod.id, unit.id, st.id].join("|"));
          h +=
            "<tr><td>" +
            esc(st.name) +
            "</td><td>" +
            (score.m ?? "—") +
            "</td><td>" +
            (score.c ?? "—") +
            '</td><td data-unit-final="' +
            key +
            '">' +
            api.finalText(result) +
            '</td><td data-unit-status="' +
            key +
            '">' +
            esc(api.status(result)) +
            "</td></tr>";
        }
        h += "</tbody></table></div>";
      }
      h += "</section>";
    }
    return h + "</div>";
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
  renderCreate,
  activateCreate,
  cancelEditor,
  preserveEditor,
  restoreEditor,
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
