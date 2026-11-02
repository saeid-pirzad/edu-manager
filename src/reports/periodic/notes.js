const modeLabel = (mode) =>
  ({
    daily: "روزانه",
    weekly: "هفتگی",
    monthly: "ماهانه",
    annual: "سالانه",
  })[mode] || "دوره‌ای";
const filters = {
  mode: "daily",
  annualFirstId: "",
  annualSecondId: "",
  date: localToday(),
  schoolId: "",
  classId: "",
  studentId: "",
  audience: "management",
  detailLevel: "summary",
  author: "",
};
// New report notes belong to the authorized academic-year owner. Historical
// term keys remain intact and are read as aliases until an explicit edit.

// Only notes that have not reached local storage stay in memory.
const notes = new Map(),
  noteReadErrors = new Map(),
  recoveryNotes = new Map();
const context = () =>
  root.EduV24?.getReportContext() || { id: "", revision: 0 };
let noteEditGeneration = 0;
const noteWorkspaceId = () => context().notesWorkspaceId || context().id;
const noteYearScopeId = () =>
  context().yearScopeId || context().year || context().id;
const noteWorkspaceIds = () => [
  ...new Set(
    [
      noteWorkspaceId(),
      ...(context().notesWorkspaceIds || []),
      context().id,
    ].filter(Boolean),
  ),
];
const noteScopeSignature = () =>
  JSON.stringify([
    noteWorkspaceId(),
    noteYearScopeId(),
    [...noteWorkspaceIds()].sort(),
  ]);
const notePeriodScope = (scope) =>
  context().yearScopeId ? "year:" + context().yearScopeId + ";" + scope : scope;
const scopedNote = (key) => /^year:[^;|]+;/.test(key.split("|")[2] || "");
const acknowledgementKey = (key) => {
  const parts = key.split("|");
  parts[2] += ";ack=1";
  return parts.join("|");
};
function yearNoteSources(key) {
  const parts = key.split("|"),
    legacy = [...parts],
    found = [],
    failures = [];
  legacy[2] = legacy[2].replace(/^year:[^;|]+;/, "");
  for (const id of noteWorkspaceIds()) {
    try {
      const saved = getDrafts(id),
        current = [id, ...parts.slice(1)].join("|"),
        previous = [id, ...legacy.slice(1)].join("|");
      if (Object.hasOwn(saved, current)) {
        found.push({ key: current, id, text: saved[current] });
        continue;
      }
      if (Object.hasOwn(saved, previous)) {
        found.push({ key: previous, id, text: saved[previous] });
        continue;
      }
      if (legacy[1] !== "weekly" || !legacy[2].startsWith("week:")) continue;
      const start = legacy[2].slice(5),
        end = addDays(start, 6);
      for (const [oldKey, text] of Object.entries(saved)) {
        const old = oldKey.split("|");
        if (
          old.length === legacy.length &&
          old.every(
            (value, index) =>
              index === 0 || index === 2 || value === legacy[index],
          ) &&
          /^\d{4}-\d{2}-\d{2}$/.test(old[2]) &&
          old[2] >= start &&
          old[2] <= end
        )
          found.push({ key: oldKey, id, text });
      }
    } catch (error) {
      failures.push(error.message || String(error));
    }
  }
  if (failures.length)
    noteReadErrors.set(noteWorkspaceId(), failures.join(" | "));
  return found;
}
function readYearNote(key) {
  const id = key.split("|")[0],
    saved = getDrafts(id),
    exists = Object.hasOwn(saved, key),
    own = exists ? saved[key] : "";
  if (exists && own === "") return "";
  let acknowledged = {};
  try {
    const raw = JSON.parse(saved[acknowledgementKey(key)] || "{}");
    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      Object.values(raw).every((text) => typeof text === "string")
    )
      acknowledged = raw;
  } catch {}
  const candidates = yearNoteSources(key).filter(
      (item) =>
        item.key !== key &&
        item.text.trim() &&
        (!exists || acknowledged[item.key] !== item.text) &&
        (!own || !own.includes(item.text)),
    ),
    unique = candidates.filter(
      (item, index) =>
        candidates.findIndex((other) => other.text === item.text) === index,
    );
  if (!unique.length) return own;
  if (!exists && unique.length === 1) return unique[0].text;
  const values = exists ? [{ text: own }, ...unique] : unique;
  return values
    .map(
      (item, index) =>
        "یادداشت پیشین " +
        (index + 1).toLocaleString("fa-IR") +
        ":\n" +
        item.text,
    )
    .join("\n\n");
}
function readNote(key) {
  if (!scopedNote(key)) return readLegacyNote(key);
  try {
    return readYearNote(key);
  } catch (error) {
    noteReadErrors.set(noteWorkspaceId(), error.message || String(error));
    return "";
  }
}
const draftStorageKey = (id = noteWorkspaceId()) =>
  "EduManager.periodicDrafts." + id;
function storedNotes(id = noteWorkspaceId()) {
  const saved = JSON.parse(localStorage.getItem(draftStorageKey(id)) || "{}");
  if (
    !saved ||
    typeof saved !== "object" ||
    Array.isArray(saved) ||
    Object.values(saved).some((value) => typeof value !== "string")
  )
    throw Error("ساختار توضیحات ذخیره‌شده معتبر نیست.");
  noteReadErrors.delete(id);
  return saved;
}
function readLegacyNote(key) {
  if (notes.has(key)) return notes.get(key);
  const id = key.split("|")[0];
  try {
    const saved = getDrafts(id);
    if (Object.prototype.hasOwnProperty.call(saved, key)) return saved[key];
    const parts = key.split("|");
    if (parts[1] !== "weekly" || !parts[2].startsWith("week:")) return "";
    const start = parts[2].slice(5),
      end = addDays(start, 6);
    const matches = Object.entries(saved)
      .filter(([oldKey, value]) => {
        const old = oldKey.split("|");
        return (
          value.trim() &&
          old.length === parts.length &&
          old.every((part, i) => i === 2 || part === parts[i]) &&
          /^\d{4}-\d{2}-\d{2}$/.test(old[2]) &&
          old[2] >= start &&
          old[2] <= end
        );
      })
      .sort(([a], [b]) => a.localeCompare(b));
    const unique = matches.filter(
      ([, value], i) => matches.findIndex(([, other]) => other === value) === i,
    );
    if (unique.length === 1) return unique[0][1];
    return unique
      .map(
        ([oldKey, value]) =>
          "یادداشت ثبت‌شده در " + oldKey.split("|")[2] + ":\n" + value,
      )
      .join("\n\n");
  } catch (error) {
    noteReadErrors.set(id, error.message || String(error));
    return "";
  }
}
function persistNote(key, value) {
  if (root.EduV24?.canWriteReportNotes?.() === false) return false;
  noteEditGeneration++;
  const id = key.split("|")[0],
    values = { [key]: value };
  if (scopedNote(key) && !key.split("|")[2].endsWith(";ack=1")) {
    const acknowledged = Object.fromEntries(
      yearNoteSources(key)
        .filter((item) => item.key !== key)
        .map((item) => [item.key, item.text]),
    );
    values[acknowledgementKey(key)] = JSON.stringify(acknowledged);
  }
  for (const [name, text] of Object.entries(values)) notes.set(name, text);
  try {
    const saved = storedNotes(id);
    Object.assign(saved, values);
    localStorage.setItem(draftStorageKey(id), JSON.stringify(saved));
    for (const name of Object.keys(values)) notes.delete(name);
    return true;
  } catch (error) {
    noteReadErrors.set(id, error.message || String(error));
    return false;
  }
}

function noteWarning() {
  const pending = [...notes.keys()].filter(
    (key) =>
      noteWorkspaceIds().includes(key.split("|")[0]) &&
      !key.split("|")[2].endsWith(";ack=1"),
  ).length;
  if (!pending && !noteWorkspaceIds().some((id) => noteReadErrors.has(id)))
    return "";
  return (
    '<div class="periodic-warnings" role="alert"><p>' +
    (pending
      ? "توضیحات " +
        pending +
        " گزارش هنوز کامل ذخیره نشده است. متن را پیش از بستن برنامه در فایل گزارش ذخیره کنید."
      : "خواندن توضیحات ذخیره‌شده انجام نشد؛ فایل پشتیبان را برای بررسی نگه دارید.") +
    `</p><button type="button" class="ghost" data-legacy-click="reports-periodic-notes:0">تلاش مجدد ذخیره توضیحات</button></div>`
  );
}
function paintNoteState() {
  const el = document.getElementById("periodicNoteStatus");
  if (el) el.innerHTML = noteWarning();
}
function retryNotes() {
  const id = noteWorkspaceId();
  for (const [key, value] of [...notes])
    if (noteWorkspaceIds().includes(key.split("|")[0])) persistNote(key, value);
  try {
    storedNotes(id);
  } catch (error) {
    noteReadErrors.set(id, error.message || String(error));
  }
  paintNoteState();
  return (
    !noteReadErrors.has(id) &&
    ![...notes.keys()].some((key) => key.split("|")[0] === id)
  );
}
function getDrafts(id = noteWorkspaceId(), recovery = recoveryNotes.get(id)) {
  const saved = {
    ...validateReportNotes(recovery, id),
    ...storedNotes(id),
  };
  for (const [key, value] of notes)
    if (key.split("|")[0] === id) saved[key] = value;
  return saved;
}
function restoreDrafts(id, value) {
  if (root.EduV24?.canWriteReportNotes?.() === false) return false;
  const recovered = validateReportNotes(value, id);
  recoveryNotes.set(id, recovered);
  let merged = { ...recovered };
  try {
    const saved = storedNotes(id);
    merged = { ...recovered, ...saved };
    for (const [key, text] of notes)
      if (key.split("|")[0] === id) merged[key] = text;
    if (
      Object.entries(merged).some(
        ([key, text]) =>
          !Object.prototype.hasOwnProperty.call(saved, key) ||
          saved[key] !== text,
      )
    )
      localStorage.setItem(draftStorageKey(id), JSON.stringify(merged));
    for (const [key, text] of [...notes])
      if (key.split("|")[0] === id && merged[key] === text) notes.delete(key);
    return true;
  } catch (error) {
    for (const [key, text] of Object.entries(merged))
      if (!notes.has(key)) notes.set(key, text);
    noteReadErrors.set(id, error.message || String(error));
    return false;
  }
}
function resetDrafts() {
  notes.clear();
  noteReadErrors.clear();
  recoveryNotes.clear();
  last = null;
}
root.addEventListener("beforeunload", (event) => {
  if (notes.size) {
    event.preventDefault();
    event.returnValue = "";
  }
});
