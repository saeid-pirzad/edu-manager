function createPanelHeading(icon, title, note = "") {
  return (
    '<summary><span class="create-panel-symbol" aria-hidden="true">' +
    EduIcons.html(icon) +
    '</span><span class="create-panel-title"><strong>' +
    title +
    "</strong>" +
    (note ? "<small>" + note + "</small>" : "") +
    '</span><span class="create-panel-toggle" aria-hidden="true"></span></summary>'
  );
}
function renderEntityQuickCreate(kind, empty) {
  const school = kind === "school";
  const label = school ? "مدرسه" : "کلاس";
  const token = school ? "1" : "5";
  return (
    '<details class="card quick-create entity-quick-create create-panel no-print"' +
    (empty ? " open" : "") +
    ">" +
    createPanelHeading(
      school ? "school" : "classroom",
      label + " جدید",
      school
        ? "نام مدرسه؛ کلاس‌ها در مرحله بعد"
        : "نام کلاس؛ هنرجویان و درس‌ها در مرحله بعد",
    ) +
    '<form data-legacy-submit="ui-school-class:' +
    token +
    '" data-entity-create="' +
    kind +
    '" class="row"><label class="entity-create-field">نام ' +
    label +
    '<input id="' +
    kind +
    'CreateName" name="name" placeholder="' +
    (school ? "مثلاً هنرستان دانش" : "مثلاً دهم شبکه") +
    '" aria-describedby="' +
    kind +
    'CreateError" required maxlength="500"></label><div class="create-panel-footer"><button type="submit" data-mutating="1">ثبت ' +
    label +
    '</button></div><p id="' +
    kind +
    'CreateError" class="entity-create-error" role="alert"></p></form></details>'
  );
}
function renderSchools() {
  let h =
    headerHtml() +
    `<section class="workflow-welcome schools-welcome no-print"><span class="schools-welcome-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 9h1M15 9h1M8 12h1M15 12h1"/></svg></span><div class="schools-welcome-copy"><h2>مدرسه‌های من</h2><p>مدرسه‌ها را اضافه، ویرایش یا حذف کنید؛ برای مدیریت کلاس‌ها وارد مدرسه شوید.</p></div></section>`;
  h += dashboardDirectory(db.schools, "schools");
  h += renderEntityQuickCreate("school", !db.schools.length);
  return h;
}
function renderSchool() {
  const school = getSchool(state.schoolId);
  if (!school) {
    state.view = "schools";
    return renderSchools();
  }
  let h =
    headerHtml() +
    breadcrumbHtml([
      { label: "مدرسه‌ها", action: "ui-school-class:2" },
      { label: school.name },
      { label: "کلاس‌ها" },
    ]);
  h += dashboardDirectory(school.classes, "classes", school.id);
  h += renderEntityQuickCreate("class", !school.classes.length);
  return h;
}

function renderClass() {
  const c = getClassObj(state.schoolId, state.classId);
  if (!c) {
    state.view = "school";
    return renderSchool();
  }
  const school = getSchool(state.schoolId);
  let h = headerHtml();
  h += breadcrumbHtml([
    { label: "مدرسه‌ها", action: "ui-school-class:6" },
    { label: school.name, action: "ui-school-class:7", schoolId: school.id },
    { label: c.name },
    { label: state.tab === "students" ? "دانش‌آموزان" : "درس‌ها" },
  ]);
  h += `<div class="tabs">
    <button class="${state.tab === "lessons" ? "active" : ""}" data-legacy-click="ui-school-class:10">📚 دروس</button>
    <button class="${state.tab === "students" ? "active" : ""}" data-legacy-click="ui-school-class:11">👥 دانش‌آموزان</button>
  </div>`;
  if (state.tab === "lessons") h += renderLessonsTab(c);
  else h += renderStudentsTab(c);
  return h;
}

function renderLessonsTab(c) {
  const lessons = c.lessons || [];
  const book =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/></svg>';
  const create =
    '<details class="card lesson-create create-panel no-print">' +
    createPanelHeading("book", "درس جدید", "نام درس و شیوه ارزشیابی") +
    EduV24.course.renderCreate() +
    "</details>";
  let h =
    '<section class="card class-lessons"><header class="lesson-list-heading"><div><h3>دروس کلاس <span class="lesson-count">' +
    lessons.length.toLocaleString("fa-IR") +
    '</span></h3><p>تعریف و ویرایش درس‌ها؛ برای کلاس‌داری وارد درس شوید.</p></div></header><div class="lesson-items">';
  if (!lessons.length)
    h +=
      '<div class="empty lesson-empty">' +
      book +
      "<strong>اولین درس کلاس را تعریف کنید</strong><p>نام درس و روش ارزشیابی را در فرم بالا وارد کنید.</p></div>";
  for (const l of lessons) {
    const id = esc(l.id),
      dual = l.gradeMode === "kardanesh",
      general = l.gradingPolicy?.subjectType === "general";
    h += `<article class="lesson-item"><div class="lesson-identity"><span class="lesson-symbol ${dual ? "dual" : "modular"}">${book}</span><div><h4>${esc(l.name)}</h4><p>${esc(l.teacher || "دبیر تعیین نشده")}</p></div></div><div class="lesson-meta"><span class="lesson-mode ${dual ? "dual" : "modular"}">${general ? "عمومی" : dual ? "نظری و عملی" : "پودمانی"}</span><span class="lesson-period">${Number(l.periodsPerWeek || 2).toLocaleString("fa-IR")} زنگ در هفته</span></div><div class="lesson-actions no-print"><button class="lesson-enter" data-legacy-click="ui-school-class:14" data-legacy-click-arg8="${esc(id)}"><span>ورود به درس</span><span class="entity-enter-arrow" aria-hidden="true">${EduIcons.html("arrow")}</span></button><details class="lesson-more"><summary id="lesson-menu-${id}" aria-label="عملیات بیشتر برای ${esc(l.name)}"><span aria-hidden="true">${EduIcons.html("more")}</span><span>بیشتر</span></summary><div class="lesson-more-menu"><button class="lesson-config ghost" data-legacy-click="ui-school-class:25" data-legacy-click-arg10="${esc(id)}">ویرایش درس</button>${
      !dual && l.poudmans.length
        ? `<button class="ghost" data-mutating="1" data-legacy-click="ui-school-class:15" data-legacy-click-arg0="${esc(id)}">ویرایش نام پودمان‌ها</button>`
        : ""
    }<button class="ghost" data-legacy-click="ui-school-class:27" data-legacy-click-arg14="${esc(id)}">کپی تعریف بدون نمرات</button><button class="danger" data-legacy-click="ui-school-class:29" data-legacy-click-arg15="${esc(id)}">حذف درس</button></div></details></div></article>`;
  }
  return h + "</div></section>" + create;
}

function filterStudentRoster(control) {
  const root = control.closest(".student-directory"),
    list = root.querySelector(".student-roster");
  const norm = (s) =>
    String(s || "")
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[۰-۹]/g, (c) => c.charCodeAt(0) - 1776)
      .replace(/[٠-٩]/g, (c) => c.charCodeAt(0) - 1632)
      .replace(/‌/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const query = norm(root.querySelector('input[type="search"]').value),
    sort = root.querySelector("select").value,
    collator = new Intl.Collator("fa", {
      numeric: true,
      sensitivity: "base",
    });
  const cards = [...list.children];
  cards.sort((a, b) => {
    if (sort === "family")
      return Number(a.dataset.order) - Number(b.dataset.order);
    if (sort === "code") {
      if (!a.dataset.code)
        return b.dataset.code
          ? 1
          : Number(a.dataset.order) - Number(b.dataset.order);
      if (!b.dataset.code) return -1;
      return (
        collator.compare(norm(a.dataset.code), norm(b.dataset.code)) ||
        Number(a.dataset.order) - Number(b.dataset.order)
      );
    }
    return (
      collator.compare(a.dataset.name, b.dataset.name) ||
      Number(a.dataset.order) - Number(b.dataset.order)
    );
  });
  let count = 0;
  for (const card of cards) {
    card.hidden = !norm(card.dataset.name + " " + card.dataset.code).includes(
      query,
    );
    if (!card.hidden) {
      count++;
      const avatar = card.querySelector(".student-avatar");
      avatar.textContent = count.toLocaleString("fa-IR");
      avatar.setAttribute(
        "aria-label",
        "ردیف " + count.toLocaleString("fa-IR"),
      );
    }
    list.append(card);
  }
  root.querySelector(".roster-results").textContent =
    count.toLocaleString("fa-IR") +
    " نفر از " +
    cards.length.toLocaleString("fa-IR") +
    " هنرجو";
  root.querySelector(".roster-no-results").hidden =
    count > 0 || cards.length === 0;
}
function renderStudentsTab(c) {
  const students = getSortedStudents(c);
  let create =
    '<details class="card quick-create student-add create-panel">' +
    createPanelHeading("users", "هنرجوی جدید") +
    `<form data-legacy-submit="ui-school-class:16" class="student-add-form" data-entity-create="student" novalidate><label>نام و نام خانوادگی<input id="studentCreateName" name="name" aria-describedby="studentCreateError" placeholder="نام کامل هنرجو" required maxlength="200"></label><label><span class="student-field-heading">کد دانش‌آموزی <span class="student-field-optional">(اختیاری)</span></span><input id="studentCreateCode" name="code" maxlength="120" aria-describedby="studentCreateError" placeholder="کد یکتا در کلاس" inputmode="numeric"></label><div class="create-panel-footer"><button type="submit">ثبت هنرجو</button></div><p id="studentCreateError" class="entity-create-error" role="alert"></p></form></details>`;
  create +=
    '<details class="card student-import create-panel no-print">' +
    createPanelHeading(
      "upload",
      "افزودن گروهی از فایل CSV",
      "ابتدا بررسی، سپس ثبت در همین کلاس",
    ) +
    '<div class="csv-import-body"><ol class="csv-import-steps"><li>قالب را دریافت کنید.</li><li>نام‌ها و کدهای اختیاری را وارد و با فرمت CSV UTF-8 ذخیره کنید.</li><li>فایل را انتخاب و پیش‌نمایش را بررسی کنید.</li></ol><div class="csv-import-actions"><button type="button" class="ghost" data-legacy-click="ui-school-class:17">دریافت قالب CSV</button><button type="button" data-mutating="1" data-legacy-click="ui-school-class:18">انتخاب و بررسی فایل</button></div><p class="csv-import-note">حداکثر ۵ مگابایت؛ تا تأیید پیش‌نمایش، اطلاعاتی ثبت نمی‌شود.</p><p class="csv-import-status" role="status" aria-live="polite"></p><p class="csv-import-error" role="alert"></p></div></details>';
  let h =
    '<section class="card student-directory"><header class="roster-heading"><div><h3>هنرجویان کلاس <span class="lesson-count">' +
    students.length.toLocaleString("fa-IR") +
    "</span></h3><p>افزودن، ویرایش و مدیریت اعضای همین کلاس</p></div></header>";
  if (!students.length)
    h +=
      '<div class="empty"><strong>هنوز هنرجویی در این کلاس نیست</strong><p>از فرم بالا یک هنرجو اضافه کنید یا فهرست کلاس را با CSV وارد کنید.</p></div>';
  h +=
    '<div class="roster-toolbar no-print" ' +
    (!students.length ? "hidden" : "") +
    `><label class="roster-search"><span>جست‌وجو در کلاس</span><input type="search" placeholder="نام یا کد دانش‌آموزی…" data-legacy-input="ui-school-class:19"></label><label class="roster-sort"><span>مرتب‌سازی</span><select data-legacy-change="ui-school-class:20"><option value="family">نام خانوادگی</option><option value="name">نام</option><option value="code">کد دانش‌آموزی</option></select></label></div><p class="roster-results" role="status" aria-live="polite">` +
    students.length.toLocaleString("fa-IR") +
    " نفر از " +
    students.length.toLocaleString("fa-IR") +
    ' هنرجو</p><div class="student-roster">';
  for (const [i, st] of students.entries()) {
    const id = esc(st.id);
    h += `<article class="student-profile" data-name="${esc(st.name)}" data-code="${esc(st.code || "")}" data-order="${i}"><div class="student-profile-main"><span class="student-avatar" aria-label="ردیف ${(i + 1).toLocaleString("fa-IR")}">${(i + 1).toLocaleString("fa-IR")}</span><div class="student-profile-info"><h4>${esc(st.name)}</h4><p>${
      st.code
        ? "کد دانش‌آموزی: <bdi>" + esc(st.code) + "</bdi>"
        : '<span class="student-code-missing">کد ثبت نشده</span>'
    }</p></div></div><div class="student-profile-actions no-print"><button class="ghost" data-legacy-click="ui-school-class:21" data-legacy-click-arg8="${esc(id)}">ویرایش مشخصات</button><details class="student-more"><summary id="student-menu-${esc(c.id)}-${id}" aria-label="عملیات بیشتر برای ${esc(st.name)}">بیشتر</summary><div class="student-more-menu"><button class="ghost" data-legacy-click="ui-school-class:26" data-legacy-click-arg13="${esc(id)}">انتقال / کپی به کلاس دیگر</button><button class="danger" data-legacy-click="ui-school-class:28" data-legacy-click-arg14="${esc(id)}">بایگانی هنرجو</button></div></details></div></article>`;
  }
  h +=
    '</div><div class="empty roster-no-results" hidden>هنرجویی پیدا نشد؛ نام یا کد دیگری جست‌وجو کنید.</div></section>';
  return h + create + buildArchiveHtml(c);
}

// Keep the link alive while mobile browsers hand the file to their download manager.
