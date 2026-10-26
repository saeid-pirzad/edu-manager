"use strict";
module.exports = async function courseFormEvents() {
  const results = [];
  const check = (id, name, pass) =>
    results.push({ id, name, pass: !!pass, observed: {} });
  closeModal();
  const school = db.schools[0],
    classroom = school.classes[0];
  goSchool(school.id);
  goClass(classroom.id);
  const count = classroom.lessons.length;
  await EduV24.course.open();
  const form = document.querySelector("#modal .record-editor");
  check(
    "CF01",
    "course editor template contains no executable inline handlers",
    !!form &&
      ![form, ...form.querySelectorAll("*")].some((element) =>
        [...element.attributes].some((attribute) =>
          /^on/i.test(attribute.name),
        ),
      ),
  );
  const branch = form.querySelector("#course_branch"),
    method = form.querySelector("#course_method");
  branch.value = "fani";
  branch.dispatchEvent(new Event("change", { bubbles: true }));
  check(
    "CF02",
    "branch change listener selects modular grading and reveals its fields",
    method.value === "modular" &&
      !document.getElementById("courseModular").hidden &&
      document.getElementById("courseDual").hidden,
  );
  method.value = "dual";
  method.dispatchEvent(new Event("change", { bubbles: true }));
  check(
    "CF03",
    "method change listener synchronizes branch and dual fields",
    branch.value === "kardanesh" &&
      !document.getElementById("courseDual").hidden &&
      document.getElementById("courseModular").hidden,
  );
  const submit = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(submit);
  for (
    let attempt = 0;
    attempt < 100 && !document.getElementById("courseError").textContent;
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  check(
    "CF04",
    "course submit prevents navigation and retains invalid form without adding a lesson",
    submit.defaultPrevented &&
      !!document.getElementById("courseError").textContent &&
      classroom.lessons.length === count &&
      form.isConnected,
  );
  form.querySelector("[data-course-cancel]").click();
  check(
    "CF05",
    "course cancellation listener closes an unchanged invalid editor",
    document.getElementById("modal").classList.contains("hidden"),
  );
  goSchools();
  return results;
};
