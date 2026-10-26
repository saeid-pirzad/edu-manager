function prepareStructureNameEditor(lesson) {
  if (!lesson.poudmans.length) return;
  const structure = document.getElementById("courseStructure");
  const section = document.createElement("details");
  section.id = "courseNames";
  section.className = "course-policy-section course-name-section";
  const summary = document.createElement("summary"),
    note = document.createElement("p");
  summary.textContent = "نام پودمان‌ها و واحدهای یادگیری";
  note.className = "muted";
  note.textContent =
    "اصلاح عنوان، شناسه‌ها، نمرات و ارتباط جلسات را تغییر نمی‌دهد. تعداد و ساختار در بخش قواعد ارزشیابی تنظیم می‌شوند.";
  section.append(summary, note, structure);
  document.getElementById("coursePolicy").closest("details").after(section);
  const policyGrid = document.querySelector("#courseModular > .course-grid");
  lesson.poudmans.forEach((pod, index) => {
    const count = document
      .getElementById("course_unitCount_" + pod.id)
      ?.closest("label");
    if (count) {
      count.firstChild.textContent = "تعداد واحدهای «" + pod.name + "»";
      policyGrid.append(count);
    }
    const label = document
      .getElementById("course_pod_" + pod.id)
      ?.closest("label");
    if (label)
      label.firstChild.textContent =
        "نام پودمان " + (index + 1).toLocaleString("fa-IR");
    pod.units.forEach((unit, unitIndex) => {
      const label = document
        .getElementById("course_unit_" + unit.id)
        ?.closest("label");
      if (label)
        label.firstChild.textContent =
          "نام واحد " +
          (unitIndex + 1).toLocaleString("fa-IR") +
          " · " +
          pod.name;
    });
  });
}
function applyStructureNames(lesson) {
  const originalNames = new Map();
  const rename = (item, prefix) => {
    originalNames.set(item.id, item.name);
    const value = val(prefix + item.id);
    if (value === undefined) return;
    const name = value.trim();
    if (!normalizedName(name) || name.length > 500)
      throw recordFieldError(
        "عنوان معتبر با حداکثر ۵۰۰ نویسه وارد کنید.",
        "course_" + prefix + item.id,
      );
    item.name = name;
  };
  for (const pod of lesson.poudmans) {
    rename(pod, "pod_");
    for (const unit of pod.units) rename(unit, "unit_");
  }
  const distinct = (items, prefix, label) => {
    for (const item of items)
      if (
        normalizedName(item.name) !==
          normalizedName(originalNames.get(item.id)) &&
        items.some(
          (other) =>
            other.id !== item.id &&
            normalizedName(other.name) === normalizedName(item.name),
        )
      )
        throw recordFieldError(
          label + " تکراری است؛ عنوان متمایز انتخاب کنید.",
          "course_" + prefix + item.id,
        );
  };
  distinct(lesson.poudmans, "pod_", "نام پودمان");
  for (const pod of lesson.poudmans)
    distinct(pod.units, "unit_", "نام واحد در این پودمان");
}
