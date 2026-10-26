const { esc } = api;
const P = root.EduPolicy;
let editing = null,
  saving = false;
const input = (id, label, value, type = "text", extra = "") =>
  `<label class="course-field">${label}<input id="course_${id}" type="${type}" value="${esc(value ?? "")}" ${extra}></label>`;
const select = (id, label, values, value, extra = "") =>
  `<label class="course-field">${label}<select id="course_${id}" ${extra}>${values.map(([v, t]) => `<option value="${v}" ${String(v) === String(value) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
const val = (id) => document.getElementById("course_" + id)?.value;
const checked = (id) => !!document.getElementById("course_" + id)?.checked;
function currentClass() {
  return api.findClass(api.state().classId);
}
function writable() {
  api.assertWritable();
}
function number(id) {
  const t = api.asciiDigits(val(id));
  if (!t || !/^\d+(?:\.\d{1,6})?$/.test(t))
    throw recordFieldError(
      "برای «" + recordFieldLabel("course_" + id) + "» عدد معتبر وارد کنید.",
      "course_" + id,
    );
  return Number(t);
}
function makePods(count, unitCount) {
  return Array.from({ length: count }, (_, i) => ({
    id: api.uid(),
    name: "پودمان " + (i + 1),
    podScores: {},
    units: Array.from({ length: unitCount }, (_, j) => ({
      id: api.uid(),
      name: "واحد یادگیری " + (j + 1),
      unitScores: {},
      applyOptions: {},
    })),
  }));
}
