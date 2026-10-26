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
  const pod = lesson.poudmans[0],
    student = classroom.students[0];
  const selector =
    'select[data-course-gate][data-pod-id="' +
    pod.id +
    '"][data-student-id="' +
    student.id +
    '"]';
  const first = document.querySelector(selector);
  check(
    "CT01",
    "gate table exposes escaped identifiers without inline onchange",
    !!first &&
      !first.hasAttribute("onchange") &&
      first.dataset.lessonId === lesson.id,
  );
  for (const [index, value] of ["yes", "no", ""].entries()) {
    const control = document.querySelector(selector);
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
    for (
      let attempt = 0;
      attempt < 200 && document.querySelector(selector) === control;
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    const stored = pod.podScores[student.id];
    check(
      "CT0" + (index + 2),
      "gate listener persists and rerenders state: " + (value || "unreviewed"),
      document.querySelector(selector) !== control &&
        (value === ""
          ? !Object.hasOwn(stored, "gate")
          : stored.gate === (value === "yes")) &&
        document.querySelector(selector)?.value === value,
    );
  }
  closeModal();
  goSchools();
  return results;
};
