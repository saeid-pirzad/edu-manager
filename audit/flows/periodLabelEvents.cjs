"use strict";
module.exports = async function periodLabelEvents() {
  const results = [],
    check = (id, name, pass) =>
      results.push({ id, name, pass: !!pass, observed: {} });
  closeModal();
  await EduV24.test.settle();
  const before = EduV24.getReportContext(),
    term = db.settings.academicTerm;
  await EduV24.openPeriods({ notice: "<fixed-term-notice>" });
  const hub = document.querySelector(".period-hub"),
    rows = [...hub.querySelectorAll("tbody tr")];
  check(
    "PL01",
    "the academic-year hub always presents exactly the fixed first and second terms",
    rows.length === 2 &&
      rows[0].cells[0].textContent === "ترم اول" &&
      rows[1].cells[0].textContent === "ترم دوم",
  );
  check(
    "PL02",
    "the hub exposes no independent year, term creation, deletion or custom naming controls",
    !hub.querySelector(
      '[data-workspace-action="new-period"], [data-workspace-action="delete-period"], [data-workspace-action="edit-period-label"], #periodYear, #periodTerm, #periodLabelEditor',
    ) &&
      ![hub, ...hub.querySelectorAll("*")].some((element) =>
        [...element.attributes].some((attribute) =>
          /^on/i.test(attribute.name),
        ),
      ),
  );
  check(
    "PL03",
    "opening the fixed-term hub escapes its notice and never changes saved identities or revisions",
    hub.textContent.includes("<fixed-term-notice>") &&
      !hub.querySelector("fixed-term-notice") &&
      db.settings.academicTerm === term &&
      EduV24.getReportContext().revision === before.revision &&
      EduV24.getReportContext().id === before.id,
  );
  closeModal();
  await EduV24.openPeriods();
  check(
    "PL04",
    "reopening the hub preserves the active term and never reintroduces custom-name editing",
    document.querySelectorAll(".period-hub tbody tr").length === 2 &&
      !document.getElementById("periodLabelEditor") &&
      EduV24.getReportContext().id === before.id &&
      EduV24.getReportContext().revision === before.revision,
  );
  closeModal();
  return results;
};
