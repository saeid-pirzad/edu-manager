async function open(lid = "", seed) {
  const activeForm = document.getElementById("courseEditor");
  if (saving || activeForm?.getAttribute("aria-busy") === "true") return false;
  if (
    activeForm &&
    activeForm.dataset.savedState !== recordEditorState(activeForm) &&
    !confirm("تغییرات درس ذخیره نشده‌اند؛ فرم دیگری باز شود؟")
  )
    return false;
  const requested = {
    workspace: api.context().id,
    classId: api.state().classId,
  };
  await api.flushDrafts({ strict: true });
  if (saving) return false;
  if (
    requested.workspace !== api.context().id ||
    requested.classId !== api.state().classId
  )
    throw Error(
      "ترم یا کلاس هنگام باز شدن فرم تغییر کرد؛ دوباره وارد تنظیمات درس شوید.",
    );
  const c = currentClass();
  if (!c) return;
  const original = c.lessons.find((l) => l.id === lid);
  if (lid && !original && !seed)
    throw Error("این درس دیگر در کلاس وجود ندارد؛ فهرست دروس را تازه کنید.");
  const l = seed || original || newCourseSeed();
  const context = { ...api.context() },
    history =
      original && api.courseHistory
        ? await api.courseHistory(c.id, original.id)
        : null;
  if (
    requested.workspace !== api.context().id ||
    requested.classId !== api.state().classId ||
    context.revision !== api.context().revision
  )
    throw Error(
      "اطلاعات سال تحصیلی هنگام بررسی سوابق تغییر کرد؛ فرم درس را دوباره باز کنید.",
    );
  const locked =
    !!original &&
    (history?.hasGrades ||
      P.hasGrades(original) ||
      api
        .getDB()
        .sessions.some(
          (s) =>
            s.lessonId === lid &&
            s.scores.some((g) => ["mostamar", "payani"].includes(g.type)),
        ));
  editing = null;
  api.showCourseClass();
  const panel = document.querySelector("#app .lesson-create");
  if (!panel) return false;
  editing = {
    pageState: { ...api.state() },
    context: { ...api.context() },
    classId: c.id,
    id: original?.id || null,
    seed: structuredClone(l),
    locked,
  };
  const h = courseFormHtml(l, original, locked);
  const summary = panel.querySelector("summary");
  summary.querySelector("strong").textContent = original
    ? "مشاهدهٔ درس"
    : "درس جدید";
  summary.querySelector("small").textContent = original
    ? "مشخصات و شیوه نمره‌دهی"
    : "مشخصات درس را وارد کنید";
  panel.replaceChildren(summary);
  panel.insertAdjacentHTML("beforeend", h);
  panel.open = true;
  initializeCourseForm(l);
  const form = panel.querySelector(".record-editor");
  (
    form.querySelector("[data-record-enable-edit]") ||
    form.querySelector("#course_name")
  ).focus({ preventScroll: true });
  panel.scrollIntoView({ block: "start", behavior: "smooth" });
}
function courseFormHtml(l, original, locked) {
  const p =
    l.gradingPolicy ||
    P.defaults(l.gradeMode === "kardanesh" ? "dual" : "modular", api.year());
  const info = P.identity(l, api.year(), currentClass());
  let h =
    '<form id="courseEditor" class="record-editor course-simple-editor" novalidate><div id="courseError" role="alert"></div><div class="course-grid course-basic-fields">';
  h +=
    input("name", "نام درس", l.name) +
    input("teacher", "نام دبیر (اختیاری)", l.teacher) +
    input(
      "periods",
      "زنگ در هفته",
      l.periodsPerWeek ?? 2,
      "number",
      'min="1" max="10"',
    );
  h += "</div>";
  const retainedMetadata = {
    year: info.year || api.year(),
    branch: info.branch || p.branch,
    authority: info.authority,
    circularNumber: p.circularNumber,
    circularDate: p.circularDate,
    reference: p.reference,
  };
  for (const [key, value] of Object.entries(retainedMetadata))
    h += `<input id="course_${key}" type="hidden" value="${esc(value ?? "")}">`;
  h +=
    '<fieldset id="coursePolicy" class="course-main-policy" ' +
    (locked ? "disabled" : "") +
    '><legend>نمره‌دهی درس</legend><div class="course-grid course-method-fields">';
  h += select(
    "subjectType",
    "نوع درس",
    [
      ["vocational", "تخصصی / مهارتی"],
      ["general", "عمومی — نمره مستقیم از ۲۰"],
    ],
    p.subjectType || "vocational",
  );
  h +=
    select(
      "method",
      "شیوه نمره‌دهی",
      [
        ["dual", "نظری و عملی"],
        ["modular", "پودمانی"],
      ],
      p.method,
    ) + "</div>";
  if (locked)
    h +=
      '<p class="course-lock-note">برای حفظ نمرات این سال تحصیلی، روش و ساختار نمره‌دهی قابل تغییر نیست.</p>';
  if (locked && !l.gradingPolicy)
    h += "<p>محاسبه نمرات با روش قبلی حفظ می‌شود.</p>";
  const dual = P.dualSettings(p);
  h +=
    '<div id="courseDual" class="course-grid course-dual-fields">' +
    input(
      "practicalWeight",
      "سهم عملی (٪)",
      dual.practicalWeight,
      "number",
      'min="0" max="100" step="any" inputmode="decimal"',
    ) +
    input(
      "theoryWeight",
      "سهم نظری (٪) — خودکار",
      100 - dual.practicalWeight,
      "text",
      "readonly",
    ) +
    input(
      "passMin",
      "حداقل نمره قبولی",
      dual.passMin,
      "number",
      'min="0" max="20" step="any" inputmode="decimal"',
    ) +
    `<input id="course_theoryMin" type="hidden" value="${esc(dual.theoryMin)}"><input id="course_practicalMin" type="hidden" value="${esc(dual.practicalMin)}"></div>`;
  h +=
    '<div id="courseModular" class="course-modular-fields"><div class="course-grid">' +
    input(
      "moduleMin",
      "حد قبولی هر پودمان",
      p.moduleMin,
      "number",
      'min="0" max="20" step="any" inputmode="decimal"',
    ) +
    select(
      "competencyMin",
      "حداقل سطح شایستگی",
      [
        [1, "سطح ۱"],
        [2, "سطح ۲"],
        [3, "سطح ۳"],
      ],
      p.competencyMin,
    ) +
    '<div id="courseAdvanced" class="course-structure-fields">';
  for (const key of ["mostamarMax", "continuousStep", "competencyFactor"])
    h += `<input id="course_${key}" type="hidden" value="${esc(p[key])}">`;
  h +=
    input(
      "podCount",
      "تعداد پودمان",
      l.poudmans.length || 5,
      "number",
      'min="1" max="20"',
    ) +
    input(
      "unitCount",
      "واحد در هر پودمان",
      p.unitCount,
      "number",
      'min="1" max="10"',
    ) +
    '</div></div><div id="courseStructure">';
  for (const [index, pod] of l.poudmans.entries()) {
    h += `<details class="course-pod-editor" ${index === 0 ? "open" : ""}><summary>پودمان ${(index + 1).toLocaleString("fa-IR")}<span class="muted">${pod.units.length.toLocaleString("fa-IR")} واحد یادگیری</span></summary><div class="course-grid">${input("pod_" + pod.id, "نام پودمان", pod.name)}`;
    for (const u of pod.units)
      h += input("unit_" + u.id, "نام واحد یادگیری", u.name);
    h += "</div></details>";
  }
  h += "</div></div></fieldset>";
  h +=
    '<div class="record-editor-context course-editor-status"><p class="muted">تعریف درس و قواعد آن در همهٔ نوبت‌های این سال تحصیلی مشترک است.</p></div><div class="record-editor-actions create-panel-footer"><button type="submit" data-mutating="1">' +
    (original ? "ذخیره تغییرات" : "ثبت درس") +
    '</button><button type="button" class="ghost" data-course-cancel>انصراف</button></div></form>';
  return h;
}
function initializeCourseForm(l) {
  const form = document.getElementById("courseEditor");
  form.dataset.courseBound = "1";
  bindCourseFormEvents(form);
  prepareStructureNameEditor(l);
  toggleMethod();
  if (api.context().readOnly) {
    form
      .querySelectorAll("input,select,textarea,button[type=submit]")
      .forEach((el) => {
        setControlDisabled(el, true);
      });
    const note = document.createElement("p");
    note.className = "course-readonly-note";
    note.textContent = api.context().closed
      ? "ترم بسته است؛ اطلاعات فقط نمایش داده می‌شوند. ویرایش پس از بازگشایی ترم امکان‌پذیر است."
      : "اطلاعات فعلاً فقط خواندنی‌اند؛ پیام وضعیت ذخیره‌سازی را بررسی و صفحه را بازخوانی کنید.";
    form.querySelector(".record-editor-context").append(note);
  }
  const openedEditing = editing;
  initializeRecordEditAccess(form, {
    enabled: !editing?.id,
    onEnable: () => {
      const summary = form.closest(".lesson-create")?.querySelector("summary");
      if (summary) {
        summary.querySelector("strong").textContent = "ویرایش درس";
        summary.querySelector("small").textContent = "اصلاح مشخصات همین درس";
      }
    },
    validate: () => {
      writable();
      if (
        editing !== openedEditing ||
        editing.context.id !== api.context().id ||
        editing.context.revision !== api.context().revision ||
        editing.classId !== api.state().classId
      )
        throw Error(
          "کلاس یا اطلاعات درس تغییر کرده است؛ فرم را دوباره باز کنید.",
        );
    },
  });
  rememberRecordEditor(form);
}
