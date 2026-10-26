"use strict";
module.exports = async function securityRendering() {
  const cases = [];
  const check = (id, name, pass) =>
    cases.push({ id, name, pass: !!pass, observed: {} });
  closeModal();
  await EduV24.test.settle();
  const school = db.schools[0],
    classroom = school.classes[0],
    student = classroom.students[0];
  const originals = [school.name, classroom.name, student.name];
  const payload =
    '<img data-audit-injected src=x onerror="globalThis.__EDU_RENDER_XSS__=true"> O\'Reilly " فارسی';
  globalThis.__EDU_RENDER_XSS__ = false;
  const safe = (root) =>
    !root.querySelector("[data-audit-injected]") &&
    !globalThis.__EDU_RENDER_XSS__;
  try {
    school.name = payload;
    classroom.name = payload;
    student.name = payload;
    goSchools();
    check(
      "SEC01",
      "school name payload is displayed as text, never a DOM element",
      safe(document.getElementById("app")) &&
        document.getElementById("app").textContent.includes("<img"),
    );
    goSchool(school.id);
    check(
      "SEC02",
      "class name payload cannot create active markup",
      safe(document.getElementById("app")),
    );
    goClass(classroom.id);
    check(
      "SEC03",
      "student name payload cannot create active markup",
      safe(document.getElementById("app")),
    );
    const lesson = classroom.lessons.find(
      (item) => item.gradingPolicy?.method === "modular",
    );
    showModal(
      "Rendering safety",
      EduV24.course.table(classroom, lesson, null, true),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    check(
      "SEC04",
      "grade table and ARIA labels safely render quoted hostile names",
      safe(document.getElementById("modalBody")),
    );
  } finally {
    [school.name, classroom.name, student.name] = originals;
    delete globalThis.__EDU_RENDER_XSS__;
    closeModal();
    goSchools();
  }
  let blocked = false;
  const violation = (event) => {
    if (
      event.blockedURI === "inline" &&
      /script-src/.test(event.effectiveDirective)
    )
      blocked = true;
  };
  const probe = document.createElement("button");
  globalThis.__EDU_CSP_PROBE__ = false;
  try {
    document.addEventListener("securitypolicyviolation", violation);
    probe.setAttribute("onclick", "globalThis.__EDU_CSP_PROBE__=true");
    document.body.append(probe);
    probe.click();
    for (let attempt = 0; attempt < 50 && !blocked; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    check(
      "SEC05",
      "CSP actually blocks a deliberately injected inline event handler",
      blocked && !globalThis.__EDU_CSP_PROBE__,
    );
  } finally {
    probe.remove();
    document.removeEventListener("securitypolicyviolation", violation);
    delete globalThis.__EDU_CSP_PROBE__;
  }
  return cases;
};
