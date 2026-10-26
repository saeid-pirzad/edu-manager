"use strict";
module.exports = async function periodLabelEvents() {
  const results = [];
  const check = (id, name, pass) =>
    results.push({ id, name, pass: !!pass, observed: {} });
  closeModal();
  await EduV24.test.settle();
  const before = EduV24.getReportContext();
  const term = db.settings.academicTerm;
  await EduV24.editPeriodLabel();
  let form = document.getElementById("periodLabelEditor");
  check(
    "PL01",
    "period label editor has no inline handlers and keeps the year read-only",
    !!form &&
      form.querySelector("#editYear").readOnly &&
      ![form, ...form.querySelectorAll("*")].some((element) =>
        [...element.attributes].some((attribute) =>
          /^on/i.test(attribute.name),
        ),
      ),
  );
  form.querySelector("#editTerm").value = "";
  const invalidSubmit = new Event("submit", {
    bubbles: true,
    cancelable: true,
  });
  form.dispatchEvent(invalidSubmit);
  for (
    let attempt = 0;
    attempt < 100 && !document.getElementById("periodLabelError").textContent;
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  check(
    "PL02",
    "period label submit rejects empty text without navigation or data changes",
    invalidSubmit.defaultPrevented &&
      !!document.getElementById("periodLabelError").textContent &&
      db.settings.academicTerm === term &&
      EduV24.getReportContext().revision === before.revision,
  );
  form.querySelector("#editTerm").value = term;
  const submit = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(submit);
  for (
    let attempt = 0;
    attempt < 200 && document.getElementById("periodLabelEditor");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  check(
    "PL03",
    "period label no-op submit returns to periods without creating a revision",
    submit.defaultPrevented &&
      !document.getElementById("periodLabelEditor") &&
      EduV24.getReportContext().revision === before.revision &&
      db.settings.academicTerm === term,
  );
  results.at(-1).observed = {
    revisionBefore: before.revision,
    revisionAfter: EduV24.getReportContext().revision,
    error: document.getElementById("periodLabelError")?.textContent || "",
  };
  await EduV24.editPeriodLabel();
  form = document.getElementById("periodLabelEditor");
  form.querySelector("[data-period-label-cancel]").click();
  check(
    "PL04",
    "reopened period label form cancels through its explicit listener",
    document.getElementById("modal").classList.contains("hidden") &&
      db.settings.academicTerm === term,
  );
  return results;
};
