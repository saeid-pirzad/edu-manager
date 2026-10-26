"use strict";
module.exports = async function gradeEvents() {
  const results = [];
  const check = (id, name, pass) =>
    results.push({ id, name, pass: !!pass, observed: {} });
  const school = db.schools[0],
    classroom = school.classes[0];
  const lesson = classroom.lessons.find(
    (item) => item.name === "آزمون رویداد معیار پودمان",
  );
  goSchool(school.id);
  goClass(classroom.id);
  goLesson(lesson.id);
  showModal(
    "Grade event test",
    EduV24.course.table(classroom, lesson, null, true),
  );
  const input = document.querySelector('input[data-grade="1"][data-field="m"]');
  const pod = lesson.poudmans.find((item) => item.id === input.dataset.pod),
    sid = input.dataset.student;
  check(
    "GE01",
    "grade input and clear button contain no executable inline handlers",
    !input.hasAttribute("oninput") &&
      !input.hasAttribute("onblur") &&
      !input.parentElement
        .querySelector("[data-clear-grade]")
        .hasAttribute("onclick"),
  );
  input.value = "21";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  check(
    "GE02",
    "delegated input immediately validates an out-of-range grade without persisting it",
    input.getAttribute("aria-invalid") === "true" &&
      !!input.parentElement.querySelector(".grade-note").textContent &&
      !Object.hasOwn(pod.podScores[sid] || {}, "m"),
  );
  input.value = "3";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  for (let attempt = 0; attempt < 200 && pod.podScores[sid]?.m !== 3; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  check(
    "GE03",
    "delegated focusout flushes the corrected draft as a numeric grade",
    input.getAttribute("aria-invalid") === "false" &&
      pod.podScores[sid]?.m === 3,
  );
  const originalConfirm = window.confirm;
  try {
    window.confirm = () => true;
    input.parentElement.querySelector("[data-clear-grade]").click();
  } finally {
    window.confirm = originalConfirm;
  }
  for (
    let attempt = 0;
    attempt < 200 && Object.hasOwn(pod.podScores[sid] || {}, "m");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  check(
    "GE04",
    "delegated clear button removes only the paired grade after confirmation",
    input.value === "" && !Object.hasOwn(pod.podScores[sid] || {}, "m"),
  );
  closeModal();
  goSchools();
  return results;
};
