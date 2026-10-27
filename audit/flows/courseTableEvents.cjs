"use strict";
module.exports = async function courseTableEvents() {
  const results = [];
  const check = (id, name, pass) =>
    results.push({ id, name, pass: !!pass, observed: {} });
  closeModal();
  const school = db.schools[0],
    classroom = school.classes[0];
  goSchool(school.id);
  goClass(classroom.id);
  await EduV24.course.open("", {
    id: uid(),
    name: "آزمون رویداد معیار پودمان",
    teacher: "",
    periodsPerWeek: 2,
    gradeMode: "poudmani",
    kardaneshScores: {},
    poudmans: [],
    gradingPolicy: {
      ...EduPolicy.defaults("modular", db.settings.academicYear),
      requireGate: true,
    },
  });
  await EduV24.course.save();
  const lesson = classroom.lessons.find(
    (item) => item.name === "آزمون رویداد معیار پودمان",
  );
  if (!lesson) throw Error("Could not create the isolated gate-event fixture");
  goLesson(lesson.id);
  showModal(
    "Gate event test",
    EduV24.course.table(classroom, lesson, null, true),
  );
  check(
    "CT01",
    "new modular lessons do not reintroduce removed mandatory-gate settings",
    lesson.gradingPolicy.requireGate === false &&
      !document.querySelector("[data-course-gate]"),
  );
  const picker = document.querySelector("#modalBody [data-module-picker]");
  const lastPod = lesson.poudmans.at(-1);
  picker.value = lastPod.id;
  picker.dispatchEvent(new Event("change", { bubbles: true }));
  check(
    "CT02",
    "module picker selects only the requested module panel",
    [...document.querySelectorAll("#modalBody [data-module-panel]")].every(
      (panel) => panel.hidden === (panel.dataset.modulePanel !== lastPod.id),
    ),
  );
  const controls = [...document.querySelectorAll("#modalBody [data-grade]")];
  check(
    "CT03",
    "modular gradebook supplies grade identifiers without executable inline handlers",
    controls.length ===
      lesson.poudmans.length * classroom.students.length * 2 &&
      controls.every(
        (control) =>
          control.dataset.lesson === lesson.id &&
          !control.hasAttribute("oninput"),
      ),
  );
  closeModal();
  goSchools();
  return results;
};
