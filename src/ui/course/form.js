async function open(lid = "", seed) {
  const requested = {
    workspace: api.context().id,
    classId: api.state().classId,
  };
  await api.flushDrafts({ strict: true });
  if (
    requested.workspace !== api.context().id ||
    requested.classId !== api.state().classId
  )
    throw Error(
      "دوره یا کلاس هنگام باز شدن فرم تغییر کرد؛ دوباره وارد تنظیمات درس شوید.",
    );
  const c = currentClass();
  if (!c) return;
  const original = c.lessons.find((l) => l.id === lid);
  if (lid && !original && !seed)
    throw Error("این درس دیگر در کلاس وجود ندارد؛ فهرست دروس را تازه کنید.");
  const school = api
    .getDB()
    .schools.find((s) => s.classes.some((x) => x.id === c.id));
  const l = seed ||
    original || {
      id: api.uid(),
      name: "",
      teacher: "",
      periodsPerWeek: 2,
      gradeMode: "kardanesh",
      kardaneshScores: {},
      poudmans: [],
    };
  const locked =
    !!original &&
    (P.hasGrades(original) ||
      api
        .getDB()
        .sessions.some(
          (s) =>
            s.lessonId === lid &&
            s.scores.some((g) => ["mostamar", "payani"].includes(g.type)),
        ));
  const p =
    l.gradingPolicy ||
    P.defaults(l.gradeMode === "kardanesh" ? "dual" : "modular", api.year());
  const previousEditing = editing;
  editing = {
    context: api.context(),
    classId: c.id,
    id: original?.id || null,
    seed: structuredClone(l),
    locked,
  };
  const info = P.identity(l, api.year());
  let h = `<form class="record-editor" novalidate><div class="record-editor-context"><span>مشخصات درس</span><h4>${esc((school?.name ? school.name + " / " : "") + c.name)}</h4><p>نام، دبیر و مشخصات توصیفی قابل اصلاح‌اند؛ نمرات و جلسات حفظ می‌شوند.</p></div><p>تعریف درس براساس ابلاغیه سالانه. نمره نهایی بر مقیاس صفر تا بیست است؛ دامنه هر ورودی تابع قواعد درس است. تأیید قواعد به معنی تأیید شماست. شماره، تاریخ و مرجع ابلاغیه و متولی استاندارد اختیاری‌اند و می‌توانند خالی بمانند.</p><div id="courseError" role="alert"></div><div class="course-grid">`;
  h +=
    input("name", "نام درس", l.name) +
    input("teacher", "هنرآموز / دبیر", l.teacher) +
    input(
      "periods",
      "زنگ در هفته",
      l.periodsPerWeek,
      "number",
      'min="1" max="10"',
    );
  h +=
    input("year", "سال تحصیلی", info.year || api.year(), "text", "readonly") +
    select(
      "grade",
      "پایه",
      [
        ["10", "دهم"],
        ["11", "یازدهم"],
        ["12", "دوازدهم"],
      ],
      info.grade || "10",
    ) +
    input("field", "رشته", info.field) +
    input("code", "کد درس / استاندارد", info.code) +
    select(
      "branch",
      "شاخه تحصیلی",
      [
        ["kardanesh", "کاردانش"],
        ["fani", "فنی‌وحرفه‌ای"],
      ],
      info.branch || p.branch,
    ) +
    input("authority", "متولی استاندارد (اختیاری)", info.authority);
  h +=
    '</div><details class="course-policy-section" ' +
    (!original ? "open" : "") +
    "><summary>قواعد ارزشیابی و ساختار درس" +
    (locked ? " · قفل‌شده به‌دلیل سابقه نمره" : "") +
    '</summary><fieldset id="coursePolicy" ' +
    (locked ? "disabled" : "") +
    "><legend>نسخه قواعد ارزشیابی</legend>";
  h += select(
    "subjectType",
    "نوع درس",
    [["vocational", "تخصصی / کاردانش"], ["general", "عمومی؛ یک نمره از ۲۰ در هر مرحله"]],
    p.subjectType || "vocational",
  );
  if (locked)
    h +=
      "<p>این درس سابقه نمره دارد؛ روش، ساختار و مرجع قواعد قفل است. برای ابلاغیه جدید، تعریف درس را بدون نمرات کپی کنید.</p>";
  if (locked && !l.gradingPolicy)
    h +=
      "<p>محاسبه قبلی حفظ می‌شود؛ این درس هنوز به قواعد ابلاغیه متصل نشده است.</p>";
  h +=
    '<div class="course-grid">' +
    select(
      "method",
      "روش ارزشیابی",
      [
        ["dual", "نظری و عملی"],
        ["modular", "پودمانی با شایستگی"],
      ],
      p.method,
    ) +
    input("circularNumber", "شماره ابلاغیه (اختیاری)", p.circularNumber) +
    input("circularDate", "تاریخ ابلاغیه (اختیاری)", p.circularDate) +
    input("reference", "مرجع / بند / صفحه ابلاغیه (اختیاری)", p.reference) +
    "</div>";
  h +=
    '<div id="courseDual" class="course-grid">' +
    input(
      "practicalWeight",
      "سهم عملی (درصد)؛ باقی برای نظری",
      70,
      "number",
      'readonly aria-readonly="true"',
    ) +
    input(
      "theoryMin",
      "حداقل مستقل نظری",
      0,
      "number",
      'readonly aria-readonly="true"',
    ) +
    input(
      "practicalMin",
      "حداقل مستقل عملی",
      0,
      "number",
      'readonly aria-readonly="true"',
    ) +
    input(
      "passMin",
      "حداقل نمره نهایی",
      14,
      "number",
      'readonly aria-readonly="true"',
    ) +
    "</div>";
  h +=
    '<div id="courseModular"><div class="course-grid">' +
    input(
      "mostamarMax",
      "حداکثر نمره مستمر",
      p.mostamarMax,
      "number",
      'min="0.1" max="20" step="any"',
    ) +
    input(
      "continuousStep",
      "گام مجاز مستمر",
      p.continuousStep,
      "number",
      'min="0.000001" step="any"',
    ) +
    input(
      "competencyFactor",
      "ضریب شایستگی (سطح ۱، ۲، ۳)",
      p.competencyFactor,
      "number",
      'min="0.1" step="any"',
    ) +
    select(
      "competencyMin",
      "حداقل سطح شایستگی",
      [
        [1, "۱"],
        [2, "۲"],
        [3, "۳"],
      ],
      p.competencyMin,
    ) +
    input(
      "moduleMin",
      "حداقل نمره هر پودمان",
      p.moduleMin,
      "number",
      'min="0" max="20" step="any"',
    ) +
    input(
      "podCount",
      "تعداد پودمان",
      l.poudmans.length || 5,
      "number",
      'min="1" max="20"',
    ) +
    input(
      "unitCount",
      "تعداد پیش‌فرض واحد هر پودمان",
      p.unitCount,
      "number",
      'min="1" max="10"',
    ) +
    '</div><p>حداکثر مستمر + ۳ × ضریب شایستگی باید ۲۰ شود. واحدهای یادگیری برای سازمان‌دهی فعالیت‌ها هستند؛ نمره رسمی در سطح پودمان ثبت می‌شود.</p><div id="courseStructure">';
  for (const pod of l.poudmans) {
    h += `<div class="card">${input("pod_" + pod.id, "نام پودمان", pod.name)}${input("unitCount_" + pod.id, "تعداد واحدهای همین پودمان", pod.units.length, "number", 'min="1" max="10"')}`;
    for (const u of pod.units)
      h += input("unit_" + u.id, "نام واحد یادگیری", u.name);
    h += "</div>";
  }
  h +=
    '</div><p>تعدادها هنگام ساخت درس جدید اعمال می‌شوند. برای تغییر ساختار درس بدون نمره، گزینه زیر را فعال کنید.</p><label><input id="course_rebuild" type="checkbox"> بازسازی پودمان‌ها و واحدها با تعدادهای بالا</label></div><p><label><input id="course_confirmed" type="checkbox" ' +
    (p.confirmed ? "checked" : "") +
    "> قواعد را با ابلاغیه این سال تطبیق داده‌ام</label></p></fieldset></details>";
  h +=
    '<div class="record-editor-actions"><button type="submit" data-mutating="1">ذخیره تغییرات درس</button><button type="button" class="ghost" data-course-cancel>انصراف</button></div></form>';
  const opened = api.showModal(
    original ? "تنظیمات درس و ابلاغیه" : "تعریف درس جدید",
    h,
  );
  if (opened === false) {
    editing = previousEditing;
    return false;
  }
  bindCourseFormEvents(document.querySelector("#modal .record-editor"));
  prepareStructureNameEditor(l);
  toggleMethod();
  if (api.context().readOnly) {
    const form = document.querySelector("#modal .record-editor");
    form
      .querySelectorAll("input,select,textarea,button[type=submit]")
      .forEach((el) => {
        setControlDisabled(el, true);
      });
    const note = document.createElement("p");
    note.className = "course-readonly-note";
    note.textContent = api.context().closed
      ? "دوره بسته است؛ اطلاعات فقط نمایش داده می‌شوند. ویرایش پس از بازگشایی دوره امکان‌پذیر است."
      : "اطلاعات فعلاً فقط خواندنی‌اند؛ پیام وضعیت ذخیره‌سازی را بررسی و صفحه را بازخوانی کنید.";
    form.querySelector(".record-editor-context").append(note);
  }
  rememberRecordEditor();
}
