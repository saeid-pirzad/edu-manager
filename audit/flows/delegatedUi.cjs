"use strict";
module.exports = async function delegatedUi() {
  const cases = [];
  const check = (id, name, pass) =>
    cases.push({ id, name, pass: !!pass, observed: {} });
  closeModal();
  await EduV24.test.settle();
  goSchools();
  const school = db.schools[0],
    classroom = school.classes[0];
  const count = db.schools.length;
  const creation = document.querySelector('form[data-entity-create="school"]');
  const submit = new Event("submit", { bubbles: true, cancelable: true });
  creation.dispatchEvent(submit);
  await new Promise((resolve) => setTimeout(resolve, 20));
  check(
    "DU01",
    "delegated school submit prevents navigation and displays validation without adding data",
    submit.defaultPrevented &&
      db.schools.length === count &&
      !!document.getElementById("schoolCreateError").textContent,
  );
  document
    .querySelector(
      '[data-legacy-click="dashboard-open"][data-key="' + school.id + '"]',
    )
    .click();
  check(
    "DU02",
    "delegated dashboard school button navigates using an escaped data identifier",
    state.schoolId === school.id && state.view === "school",
  );
  document
    .querySelector(
      '[data-legacy-click="dashboard-open"][data-key="' + classroom.id + '"]',
    )
    .click();
  check(
    "DU03",
    "delegated dashboard class button survives page replacement",
    state.classId === classroom.id && state.view === "class",
  );
  document.querySelector('[data-workspace-action="periods"]').click();
  for (
    let attempt = 0;
    attempt < 100 &&
    document.getElementById("modal").classList.contains("hidden");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  check(
    "DU04",
    "workspace period command opens the period dialog from the rendered control",
    document.getElementById("modalTitle").textContent ===
      "دوره‌های تحصیلی و کارنامه نهایی",
  );
  closeModal();
  showModal(
    "Calendar delegation",
    '<input id="delegatedDate" type="date" value="' + todayISO() + '">',
  );
  initShamsiPickers();
  document.getElementById("delegatedDate").nextElementSibling.click();
  const before = [calViewYear, calViewMonth].join("-");
  document.querySelector('#calPopup [data-calendar-direction="1"]').click();
  check(
    "DU05",
    "delegated calendar month navigation remains open and changes month under CSP",
    calPopup.classList.contains("open") &&
      [calViewYear, calViewMonth].join("-") !== before,
  );
  document.querySelector("#calPopup .calendar-close").click();
  check(
    "DU06",
    "delegated calendar close action closes only the popup",
    !calPopup.classList.contains("open") &&
      !document.getElementById("modal").classList.contains("hidden"),
  );
  closeModal();
  goReports();
  const audience = document.querySelector(
    '[data-legacy-change="reports-periodic-render:0"]',
  );
  audience.value = "parent";
  audience.dispatchEvent(new Event("change", { bubbles: true }));
  check(
    "DU07",
    "delegated periodic audience filter renders the student selector under CSP",
    !!document.querySelector(
      '[data-legacy-change="reports-periodic-render:5"]',
    ),
  );
  goMaster();
  const settings = document.querySelector("details.week-settings");
  settings.open = !settings.open;
  await new Promise((resolve) => setTimeout(resolve, 20));
  check(
    "DU08",
    "non-bubbling settings toggle preserves its open state under CSP",
    state.masterSettingsOpen === settings.open,
  );
  goSchools();
  return cases;
};
