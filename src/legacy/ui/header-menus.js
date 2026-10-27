function breadcrumbHtml(items) {
  return (
    '<nav class="breadcrumb" aria-label="مسیر جاری"><ol>' +
    items
      .map((item, index) => {
        const label = "<bdi>" + esc(item.label) + "</bdi>";
        const content =
          index === items.length - 1
            ? '<span aria-current="page">' + label + "</span>"
            : item.action
              ? '<a data-legacy-click="' +
                esc(item.action) +
                '"' +
                (item.schoolId
                  ? ' data-legacy-click-arg0="' + esc(item.schoolId) + '"'
                  : "") +
                ">" +
                label +
                "</a>"
              : "<span>" + label + "</span>";
        return "<li>" + content + "</li>";
      })
      .join("") +
    "</ol></nav>"
  );
}
function headerHtml() {
  const icon = (path) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
    path +
    '"/></svg>';
  const icons = {
    school:
      "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 9h1M15 9h1M8 12h1M15 12h1",
    report: "M4 3v18h17M8 17v-5M13 17V8M18 17V5",
    calendar: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2",
    settings:
      "M9 4h6l1 3 3 1 1 6-3 2-1 3H9l-1-3-3-2 1-6 3-1 1-3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    data: "M4 5h16v15H4zM4 9h16M8 13h8M8 16h5",
    home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
    book: "M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15",
    copy: "M8 3h12v14H8zM4 7v14h12",
    upload: "M12 16V3M7 8l5-5 5 5M4 15v6h16v-6",
    trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  };
  const btn = (label, key, action, active = false, extra = "") =>
    '<button type="button" class="header-action' +
    (active ? " is-active" : "") +
    '" data-header-action="' +
    action +
    '" ' +
    (active ? 'aria-current="page" ' : "") +
    extra +
    ">" +
    icon(icons[key]) +
    "<span>" +
    label +
    "</span></button>";
  const caret =
    '<svg class="header-caret" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>';
  const sub = (label, key, action, danger = false) =>
    '<button type="button" ' +
    (danger ? 'class="danger-item" ' : "") +
    'data-header-action="' +
    action +
    '">' +
    icon(icons[key]) +
    "<span>" +
    label +
    "</span></button>";
  let h = '<div class="topbar"><div class="header-brand"><h1>کلاس‌یار</h1>';
  h += btn(
    "خانه",
    "home",
    "schools",
    state.view === "schools",
    'aria-label="خانه"',
  ).replace('class="header-action', 'class="header-home header-action');
  h += '</div><div class="actions header-actions">';
  h +=
    btn("گزارش‌ها", "report", "reports", state.view === "reports") +
    btn("برنامه هفتگی", "calendar", "master", state.view === "master");
  h +=
    '<div class="header-dropdown">' +
    btn(
      "داده‌ها",
      "data",
      "toggle-data",
      false,
      'id="dataMenuButton" aria-controls="dataMenu" aria-expanded="false"',
    ).replace("</button>", caret + "</button>") +
    '<div class="data-menu" id="dataMenu" aria-label="مدیریت داده‌ها">' +
    sub("پشتیبان‌گیری", "copy", "export") +
    sub("بازیابی از فایل", "upload", "import") +
    sub("حذف کامل داده‌ها", "trash", "wipe", true) +
    "</div></div>";
  h += btn("تنظیمات", "settings", "settings") + "</div></div>";
  return h;
}
function setHeaderMenu(id, open) {
  const menu = document.getElementById(id),
    button = document.getElementById(id + "Button");
  menu?.classList.toggle("open", open);
  button?.setAttribute("aria-expanded", String(open));
}
function toggleClassMenu(e) {
  e.stopPropagation();
  const open = !document
    .getElementById("classMenu")
    ?.classList.contains("open");
  closeDataMenu();
  setHeaderMenu("classMenu", open);
}
function closeClassMenu() {
  setHeaderMenu("classMenu", false);
}
function toggleDataMenu(e) {
  e.stopPropagation();
  const open = !document.getElementById("dataMenu")?.classList.contains("open");
  closeClassMenu();
  setHeaderMenu("dataMenu", open);
}

const contextualMenuSelector =
  ".dashboard-entity-more,.lesson-more,.student-more,.session-list-actions,.workspace-tools";
function closeContextualMenus(except = null) {
  for (const menu of document.querySelectorAll(contextualMenuSelector))
    if (menu !== except && menu.open) menu.open = false;
}
document.addEventListener(
  "toggle",
  (event) => {
    if (event.target.matches?.(contextualMenuSelector) && event.target.open)
      closeContextualMenus(event.target);
  },
  true,
);
document.addEventListener("click", (event) => {
  const current = event.target.closest?.(contextualMenuSelector);
  if (current && event.target.closest("button,a"))
    current.querySelector("summary")?.focus({ preventScroll: true });
  closeContextualMenus(
    current && !event.target.closest("button,a") ? current : null,
  );
});
function closeDataMenu() {
  setHeaderMenu("dataMenu", false);
}
document.addEventListener("click", (e) => {
  closeClassMenu();
  closeDataMenu();
  const nav = document.querySelector(".navigation-menu");
  if (
    nav &&
    !e.target.closest(".navigation-menu") &&
    matchMedia("(max-width:700px), (max-width:1000px) and (pointer:coarse)")
      .matches
  )
    nav.open = false;
});
document.addEventListener("keydown", (e) => {
  if (
    e.key !== "Escape" ||
    !document.getElementById("modal").classList.contains("hidden")
  )
    return;
  const contextMenu = document.querySelector(
    ".dashboard-entity-more[open],.lesson-more[open],.student-more[open],.session-list-actions[open],.workspace-tools[open]",
  );
  if (contextMenu) {
    contextMenu.open = false;
    contextMenu.querySelector("summary")?.focus();
    e.preventDefault();
    return;
  }
  const nav = document.querySelector(".navigation-menu");
  if (
    nav?.open &&
    !document.querySelector(".header-dropdown .data-menu.open") &&
    matchMedia("(max-width:700px), (max-width:1000px) and (pointer:coarse)")
      .matches
  ) {
    nav.open = false;
    nav.querySelector("summary")?.focus();
    e.preventDefault();
    return;
  }
  const open = document.querySelector(".header-dropdown .data-menu.open");
  if (open) {
    const button = document.getElementById(open.id + "Button");
    closeClassMenu();
    closeDataMenu();
    button?.focus();
    e.preventDefault();
  }
});

function goCurrentClass() {
  if (state.classId) {
    goClass(state.classId);
  } else if (state.schoolId) {
    const school = getSchool(state.schoolId);
    if (school && school.classes.length > 0) goClass(school.classes[0].id);
    else goSchool(state.schoolId);
  } else {
    if (db.schools.length > 0 && db.schools[0].classes.length > 0) {
      state.schoolId = db.schools[0].id;
      goClass(db.schools[0].classes[0].id);
    } else if (db.schools.length > 0) {
      goSchool(db.schools[0].id);
    } else {
      goSchools();
    }
  }
}

function goCurrentLesson() {
  if (state.lessonId) {
    goLesson(state.lessonId);
  } else if (state.classId) {
    const cls = getClassObj(state.schoolId, state.classId);
    if (cls && cls.lessons && cls.lessons.length > 0) {
      goLesson(cls.lessons[0].id);
    } else {
      goClass(state.classId);
    }
  } else if (state.schoolId) {
    const school = getSchool(state.schoolId);
    if (school && school.classes.length > 0) {
      const firstClass = school.classes[0];
      if (firstClass.lessons && firstClass.lessons.length > 0) {
        goLesson(firstClass.lessons[0].id);
      } else {
        goClass(firstClass.id);
      }
    } else {
      goSchool(state.schoolId);
    }
  } else {
    if (db.schools.length > 0 && db.schools[0].classes.length > 0) {
      const firstClass = db.schools[0].classes[0];
      if (firstClass.lessons && firstClass.lessons.length > 0) {
        goLesson(firstClass.lessons[0].id);
      } else {
        goClass(firstClass.id);
      }
    } else if (db.schools.length > 0) {
      goSchool(db.schools[0].id);
    } else {
      goSchools();
    }
  }
}

// ==================== سیستم کپی ====================
