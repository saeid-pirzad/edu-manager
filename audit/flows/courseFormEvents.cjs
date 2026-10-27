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
  const form = document.querySelector("#app #courseEditor");
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
  check(
    "CF09",
    "course dialog has no duplicate introduction and keeps the live save status",
    !form.querySelector(".record-editor-context h4") &&
      !form.textContent.includes("اطلاعات اصلی را اصلاح کنید") &&
      form.querySelector('button[type="submit"]').textContent.trim() ===
        "ثبت درس" &&
      !!form.querySelector('.course-editor-status [role="status"]') &&
      !!form.querySelector(".course-basic-fields #course_name"),
  );
  document.getElementById("course_teacher").value = "آزمون حذف پیام";
  document
    .getElementById("course_teacher")
    .dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  check(
    "CF31",
    "course edits do not display a change-count status or leave an empty status card",
    form.querySelector(".record-editor-state").hidden &&
      form.querySelector(".record-editor-state").textContent === "" &&
      form.querySelector(".course-editor-status").hidden &&
      !form.querySelector(".record-editor-review"),
  );
  document.getElementById("course_teacher").value = "";
  check(
    "CF06",
    "routine course editing starts with optional and advanced sections collapsed",
    !form.querySelector("#courseExtra") &&
      !form.querySelector("#courseAdvanced").open &&
      !form.querySelector("#course_rebuild") &&
      !form.querySelector("#course_confirmed") &&
      form.querySelectorAll(".course-basic-fields input").length === 3 &&
      form.querySelector("#course_practicalWeight").type === "number" &&
      form.querySelector("#course_competencyFactor").type === "hidden" &&
      form.querySelector("#course_reference").type === "hidden" &&
      form.querySelector("#coursePolicy").contains(method),
  );
  check(
    "CF10",
    "optional identity fields are absent while administrative metadata remains intact",
    !form.textContent.includes("مشخصات تکمیلی") &&
      ["grade", "field", "code"].every(
        (key) => !form.querySelector("#course_" + key),
      ) &&
      [
        "year",
        "branch",
        "authority",
        "circularNumber",
        "circularDate",
        "reference",
      ].every((key) => form.querySelector("#course_" + key)?.type === "hidden"),
  );
  const subject = form.querySelector("#course_subjectType");
  const practicalWeight = form.querySelector("#course_practicalWeight");
  practicalWeight.value = "60";
  practicalWeight.dispatchEvent(new Event("input", { bubbles: true }));
  check(
    "CF23",
    "theory share is derived from practical share and is read-only",
    form.querySelector("#course_theoryWeight").value === "40" &&
      form.querySelector("#course_theoryWeight").readOnly &&
      !form.querySelector("#courseAdvanced").contains(practicalWeight),
  );
  practicalWeight.value = "70";
  practicalWeight.dispatchEvent(new Event("input", { bubbles: true }));
  subject.value = "general";
  subject.dispatchEvent(new Event("change", { bubbles: true }));
  check(
    "CF07",
    "general subjects hide irrelevant grading controls without a redundant hint",
    method.value === "dual" &&
      method.closest("label").hidden &&
      form.querySelector("#courseDual").hidden &&
      !form.querySelector("#coursePolicyHint"),
  );
  subject.value = "vocational";
  subject.dispatchEvent(new Event("change", { bubbles: true }));
  check(
    "CF08",
    "vocational subjects restore the grading choice without expanding specialist sections",
    !method.closest("label").hidden &&
      !form.querySelector("#courseAdvanced").open,
  );
  branch.value = "fani";
  branch.dispatchEvent(new Event("change", { bubbles: true }));
  check(
    "CF02",
    "branch change listener selects modular grading and reveals its fields",
    method.value === "modular" &&
      !document.getElementById("courseAdvanced").hidden &&
      !document.getElementById("courseModular").hidden &&
      document.getElementById("courseDual").hidden,
  );
  method.value = "dual";
  method.dispatchEvent(new Event("change", { bubbles: true }));
  check(
    "CF03",
    "method change listener synchronizes branch and dual fields",
    branch.value === "kardanesh" &&
      document.getElementById("courseAdvanced").hidden &&
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
    document.getElementById("courseEditor") !== form &&
      document.getElementById("course_name").value === "" &&
      document.getElementById("modal").classList.contains("hidden"),
  );
  const originalLesson = classroom.lessons[0];
  const originalName = originalLesson.name;
  const originalScores = JSON.stringify({
    direct: originalLesson.kardaneshScores,
    pods: originalLesson.poudmans,
    policy: originalLesson.gradingPolicy,
  });
  await EduV24.course.open(originalLesson.id);
  const inline = document.getElementById("courseEditor");
  check(
    "CF24",
    "existing graded lessons keep weighting and passing controls locked",
    !EduPolicy.hasGrades(originalLesson) ||
      (inline.querySelector("#course_practicalWeight").matches(":disabled") &&
        inline.querySelector("#course_passMin").matches(":disabled")),
  );
  check(
    "CF11",
    "editing replaces the create form in the page without opening a modal",
    !!inline?.closest("#app .lesson-create") &&
      !document.querySelector(".lesson-create-form") &&
      document.getElementById("modal").classList.contains("hidden") &&
      inline.querySelector("#course_name").value === originalName,
  );
  inline.querySelector("#course_teacher").value = "آزمون حفظ فرم";
  inline
    .querySelector("#course_teacher")
    .dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  check(
    "CF32",
    "editing a course never creates a change-review panel or reset button",
    !inline.querySelector(".record-editor-review") &&
      !inline.textContent.includes("تغییر پیش از ذخیره") &&
      !inline.textContent.includes("بازگردانی مقادیر فرم"),
  );
  render();
  check(
    "CF12",
    "routine rendering preserves unsaved course inputs and listeners",
    document.getElementById("courseEditor") === inline &&
      inline.querySelector("#course_teacher").value === "آزمون حفظ فرم",
  );
  const previousConfirm = window.confirm;
  try {
    window.confirm = () => false;
    goSchools();
    check(
      "CF13",
      "declining navigation keeps the same inline course and class",
      document.getElementById("courseEditor") === inline &&
        state.view === "class" &&
        state.classId === classroom.id,
    );
    inline.querySelector("[data-course-cancel]").click();
    check(
      "CF14",
      "declining cancellation preserves unsaved course edits",
      inline.isConnected,
    );
  } finally {
    window.confirm = previousConfirm;
  }
  inline.querySelector("#course_name").value = originalName + " — آزمون ویرایش";
  await EduV24.course.save();
  const saved = classroom.lessons.find(
    (lesson) => lesson.id === originalLesson.id,
  );
  check(
    "CF15",
    "inline save updates the existing lesson without duplication or loss of grades",
    saved.name === originalName + " — آزمون ویرایش" &&
      classroom.lessons.length === count &&
      JSON.stringify({
        direct: saved.kardaneshScores,
        pods: saved.poudmans,
        policy: saved.gradingPolicy,
      }) === originalScores &&
      document.getElementById("course_name").value === "" &&
      document.querySelectorAll(".lesson-create form").length === 1,
  );
  const createForm = document.getElementById("courseEditor");
  createForm.closest("details").open = true;
  document.getElementById("course_name").value = "آزمون افزودن مستقیم";
  document.getElementById("course_teacher").value = "دبیر آزمون";
  document.getElementById("course_periods").value = "3";
  document.getElementById("course_subjectType").value = "general";
  document
    .getElementById("course_subjectType")
    .dispatchEvent(new Event("change", { bubbles: true }));
  render();
  check(
    "CF17",
    "unsaved new course survives routine rendering in the same form",
    document.getElementById("courseEditor") === createForm &&
      document.getElementById("course_name").value === "آزمون افزودن مستقیم",
  );
  await Promise.all([EduV24.course.save(), EduV24.course.save()]);
  check(
    "CF16",
    "quick creation saves once in the page without a second confirmation form",
    classroom.lessons.length === count + 1 &&
      classroom.lessons.some(
        (lesson) =>
          lesson.name === "آزمون افزودن مستقیم" &&
          lesson.periodsPerWeek === 3 &&
          lesson.gradingPolicy.subjectType === "general",
      ) &&
      document.getElementById("courseEditor") !== createForm &&
      document.getElementById("modal").classList.contains("hidden"),
  );
  const invalidForm = document.getElementById("courseEditor");
  document.getElementById("course_name").value = "آزمون افزودن مستقیم";
  try {
    await EduV24.course.save();
  } catch (failure) {
    EduV24.course.error(failure);
  }
  check(
    "CF18",
    "duplicate creation stays in the same form with an inline error and no extra lesson",
    document.getElementById("courseEditor") === invalidForm &&
      classroom.lessons.length === count + 1 &&
      !!document.getElementById("courseError").textContent,
  );
  document.getElementById("course_name").value = "آزمون درس پودمانی";
  document.getElementById("course_periods").value = "0";
  let invalidPeriods = false;
  try {
    await EduV24.course.save();
  } catch (failure) {
    invalidPeriods = failure.fieldId === "course_periods";
  }
  check(
    "CF19",
    "zero periods are rejected rather than silently replaced with two",
    invalidPeriods && classroom.lessons.length === count + 1,
  );
  document.getElementById("course_periods").value = "2";
  document.getElementById("course_method").value = "modular";
  document
    .getElementById("course_method")
    .dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("course_podCount").value = "2";
  document.getElementById("course_unitCount").value = "3";
  document.getElementById("course_moduleMin").value = "14";
  document.getElementById("course_competencyMin").value = "3";
  check(
    "CF20",
    "new modular structure is disclosed without redundant identity fields",
    !document.getElementById("courseAdvanced").matches("details") &&
      document.getElementById("course_podCount").closest(".course-grid") ===
        document.getElementById("course_moduleMin").closest(".course-grid") &&
      !document.getElementById("courseAdvanced").hidden &&
      !document.getElementById("course_grade"),
  );
  await EduV24.course.save();
  const modular = classroom.lessons.find(
    (lesson) => lesson.name === "آزمون درس پودمانی",
  );
  check(
    "CF21",
    "new modular course uses the chosen structure without inventing a grade",
    modular?.poudmans.length === 2 &&
      modular.poudmans.every((pod) => pod.units.length === 3) &&
      modular.courseInfo.grade === (classroom.grade || ""),
  );
  check(
    "CF28",
    "modular passing fields are saved and drive both grade and competency thresholds",
    modular.gradingPolicy.moduleMin === 14 &&
      modular.gradingPolicy.competencyMin === 3 &&
      !EduPolicy.moduleResult(modular.gradingPolicy, { m: 4, c: 2 }).passed &&
      EduPolicy.moduleResult(modular.gradingPolicy, { m: 4, c: 3 }).passed,
  );
  const structureIds = JSON.stringify(
    modular.poudmans.map((pod) => [pod.id, pod.units.map((unit) => unit.id)]),
  );
  await EduV24.course.openNames(modular.id);
  const names = document.getElementById("courseNames");
  check(
    "CF29",
    "existing modular lessons group names into individual expandable modules without rebuild controls",
    names.open &&
      names.querySelectorAll(".course-pod-editor").length === 2 &&
      names.querySelectorAll(".course-pod-editor[open]").length === 1 &&
      document.getElementById("courseAdvanced").hidden &&
      !document.getElementById("courseModular").hidden &&
      !document.getElementById("course_rebuild"),
  );
  document.getElementById("course_pod_" + modular.poudmans[0].id).value =
    "پودمان مرتب‌شده";
  await EduV24.course.save();
  const renamedModular = classroom.lessons.find(
    (lesson) => lesson.id === modular.id,
  );
  check(
    "CF30",
    "renaming a grouped module preserves all module and unit identifiers",
    renamedModular.poudmans[0].name === "پودمان مرتب‌شده" &&
      JSON.stringify(
        renamedModular.poudmans.map((pod) => [
          pod.id,
          pod.units.map((unit) => unit.id),
        ]),
      ) === structureIds,
  );
  await EduV24.course.open("", {
    id: uid(),
    name: "آزمون حفظ مشخصات قدیمی",
    teacher: "",
    periodsPerWeek: 2,
    gradeMode: "kardanesh",
    kardaneshScores: {},
    poudmans: [],
    courseInfo: { grade: "12", field: "الکترونیک", code: "old-code" },
    gradingPolicy: {
      ...EduPolicy.defaults("dual", db.settings.academicYear),
      grade: "12",
      field: "الکترونیک",
      code: "old-code",
      confirmed: true,
      circularNumber: "123",
      circularDate: "1405/01/01",
      reference: "مرجع قبلی",
    },
  });
  await EduV24.course.save();
  const retained = classroom.lessons.find(
    (lesson) => lesson.name === "آزمون حفظ مشخصات قدیمی",
  );
  check(
    "CF22",
    "removing optional fields preserves identity and administrative metadata during save",
    retained?.courseInfo.grade === "12" &&
      retained.courseInfo.field === "الکترونیک" &&
      retained.courseInfo.code === "old-code" &&
      retained.gradingPolicy.confirmed === true &&
      retained.gradingPolicy.circularNumber === "123" &&
      retained.gradingPolicy.reference === "مرجع قبلی",
  );
  const configurableForm = document.getElementById("courseEditor");
  document.getElementById("course_name").value = "آزمون ضرایب قابل تنظیم";
  document.getElementById("course_practicalWeight").value = "101";
  let invalidWeight = false;
  try {
    await EduV24.course.save();
  } catch (failure) {
    invalidWeight = failure.fieldId === "course_practicalWeight";
  }
  check(
    "CF25",
    "weights outside zero to one hundred are rejected in the same form",
    invalidWeight &&
      document.getElementById("courseEditor") === configurableForm,
  );
  document.getElementById("course_practicalWeight").value = "60";
  document
    .getElementById("course_practicalWeight")
    .dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("course_passMin").value = "12";
  await EduV24.course.save();
  const configured = classroom.lessons.find(
    (lesson) => lesson.name === "آزمون ضرایب قابل تنظیم",
  );
  check(
    "CF26",
    "saved custom weights and threshold actually drive final grades",
    configured?.gradingPolicy.dualConfigurable === true &&
      configured.gradingPolicy.practicalWeight === 60 &&
      configured.gradingPolicy.passMin === 12 &&
      EduPolicy.dual(configured.gradingPolicy, 20, 0).final === 12,
  );
  await EduV24.course.open(configured.id);
  check(
    "CF27",
    "reopening the course restores custom weights and the computed theory share",
    document.getElementById("course_practicalWeight").value === "60" &&
      document.getElementById("course_theoryWeight").value === "40" &&
      document.getElementById("course_passMin").value === "12",
  );
  EduV24.course.cancelEditor();
  goSchools();
  return results;
};
