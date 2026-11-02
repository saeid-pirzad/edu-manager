// Private deputy bundle fragment; assembled inside the deputy scope.
const FILE_LIMIT = 32 * 1024 * 1024;
const labels = {
  first: "ترم اول",
  second: "ترم دوم",
  all: "کل سال · هر دو ترم",
  present: "حاضر",
  absent: "غایب",
  late: "با تأخیر",
  leave: "مرخصی",
  unknown: "تعیین‌نشده",
};
const state = {
  tab: "receive",
  rows: [],
  followups: [],
  streamKey: "",
  school: "",
  year: "",
  sender: "",
  term: "first",
  classId: "",
  studentId: "",
  reportSourceKey: "",
  reportSourceIdentity: null,
  reportTargetMissing: "",
  from: "",
  to: "",
  dateErrors: { from: "", to: "" },
  preview: null,
  restore: null,
  safetyInfo: null,
  busy: false,
  ready: false,
  status: "در حال باز کردن کارتابل…",
  error: false,
  stale: false,
  noteClass: "",
  noteStudent: "",
  noteText: "",
  noteOrigin: "",
  editing: null,
  sourceOptionsOpen: false,
  backupOpen: false,
  noteEditorOpen: false,
};
let store = null;
let host = null;
let started = false;
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
const fa = (n) => Number(n || 0).toLocaleString("fa-IR");
const number = (n) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("fa-IR", { maximumFractionDigits: 2 })
    : "—";
const date = (value) => {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? value + "T12:00:00" : value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("fa-IR-u-ca-persian", { calendar: "persian" });
};
const dateTime = (value) =>
  new Date(value).toLocaleString("fa-IR-u-ca-persian", {
    calendar: "persian",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const option = (value, text, selected) =>
  '<option value="' +
  esc(value) +
  '"' +
  (value === selected ? " selected" : "") +
  ">" +
  esc(text) +
  "</option>";
const icon = (name, style = "") =>
  '<span class="ed-icon ' +
  style +
  '" aria-hidden="true">' +
  root.EduIcons.html(name) +
  "</span>";
const actionIcons = Object.freeze({
  refresh: "refresh",
  "choose-import": "upload",
  "confirm-import": "check",
  "cancel-preview": "close",
  "open-stream": "arrow",
  backup: "download",
  "choose-restore": "folder",
  "safety-backup": "shield",
  "confirm-restore": "upload",
  "cancel-restore": "close",
  print: "print",
  "cancel-note": "close",
  "edit-note": "edit",
  "toggle-note": "check",
  "calendar-clear": "trash",
});
const action = (name, text, extra = "", style = "") =>
  '<button type="button" data-deputy-action="' +
  name +
  '" class="ed-button ' +
  style +
  '" ' +
  extra +
  ">" +
  icon(actionIcons[name] || "arrow") +
  "<span>" +
  esc(text) +
  "</span>" +
  "</button>";
const selected = () => state.rows.find((row) => row.key === state.streamKey);
const empty = (title, text) =>
  '<div class="ed-empty">' +
  icon("folder", "ed-empty-symbol") +
  "<h3>" +
  esc(title) +
  "</h3><p>" +
  esc(text) +
  "</p></div>";
const field = (text, html, note = "") =>
  '<label class="ed-field"><span>' +
  esc(text) +
  "</span>" +
  html +
  (note ? "<small>" + esc(note) + "</small>" : "") +
  "</label>";
const select = (id, content) =>
  '<select id="' + id + '">' + content + "</select>";
const countCard = (title, value, style = "") =>
  '<div class="ed-metric ' +
  style +
  '"><strong>' +
  fa(value) +
  "</strong><span>" +
  esc(title) +
  "</span></div>";

function identity(packet) {
  return (
    "کد دبیر " +
    packet.sender.code +
    " · " +
    packet.sender.name +
    " · " +
    packet.school.name +
    " · کد مدرسه " +
    packet.school.code +
    " · " +
    packet.academicYear
  );
}

function sourceRows() {
  return state.rows.filter(
    (row) =>
      (!state.school || row.packet.school.code === state.school) &&
      (!state.year || row.packet.academicYear === state.year) &&
      (!state.sender || row.packet.sender.code === state.sender),
  );
}

function classes(packet) {
  const result = new Map();
  for (const period of packet?.periods || []) {
    for (const item of period.school.classes) {
      const old = result.get(item.id);
      const students = new Map((old?.students || []).map((st) => [st.id, st]));
      for (const student of [
        ...(item.students || []),
        ...(item.archivedStudents || []),
      ])
        students.set(student.id, student);
      result.set(item.id, { ...item, students: [...students.values()] });
    }
  }
  return [...result.values()];
}

function normalizeSelection() {
  const available = sourceRows();
  const lostAudienceSource = Boolean(
    state.studentId &&
    state.streamKey &&
    !state.rows.some((row) => row.key === state.streamKey),
  );
  if (
    !lostAudienceSource &&
    !available.some((row) => row.key === state.streamKey)
  )
    state.streamKey = available[0]?.key || "";
  if (state.reportSourceKey !== state.streamKey) {
    state.classId = "";
    state.studentId = "";
    state.reportSourceKey = state.streamKey;
  }
  if (
    state.noteOrigin &&
    state.noteOrigin !== state.streamKey &&
    !hasDraft() &&
    !state.editing
  )
    clearNote();
  const packet = selected()?.packet;
  const previousIdentity = state.reportSourceIdentity;
  const reboundAudienceSource = Boolean(
    state.studentId &&
    packet &&
    previousIdentity &&
    (previousIdentity.schoolId !== packet.school.id ||
      previousIdentity.terms.some(
        (old) =>
          !packet.periods.some(
            (period) =>
              period.termKind === old.termKind && period.id === old.id,
          ),
      )),
  );
  if (packet && !reboundAudienceSource)
    state.reportSourceIdentity = audienceSourceIdentity(packet);
  if (
    packet &&
    state.term !== "all" &&
    !packet.periods.some((p) => p.termKind === state.term)
  )
    state.term = packet.periods[0].termKind;
  state.reportTargetMissing = "";
  if (lostAudienceSource)
    state.reportTargetMissing =
      "پروندهٔ مخاطب انتخاب‌شده در کارتابل جدید نیست؛ فرستنده و مخاطب گزارش را دوباره انتخاب کنید.";
  else if (reboundAudienceSource)
    state.reportTargetMissing =
      "شناسهٔ منبع مخاطب در بازیابی جدید تغییر کرده است؛ مخاطب گزارش را دوباره انتخاب کنید.";
  else if (
    state.classId &&
    !classes(packet).some((c) => c.id === state.classId)
  )
    state.reportTargetMissing =
      "کلاس انتخاب‌شده در فایل جدید نیست؛ مخاطب گزارش را دوباره انتخاب کنید.";
  else if (
    state.studentId &&
    (!state.classId ||
      !reportStudents(packet).some((student) => student.id === state.studentId))
  )
    state.reportTargetMissing =
      "هنرجوی انتخاب‌شده در فایل جدید نیست؛ مخاطب گزارش را دوباره انتخاب کنید.";
  if (
    !state.editing &&
    !hasDraft() &&
    !classes(packet).some((c) => c.id === state.noteClass)
  ) {
    state.noteClass = "";
    state.noteStudent = "";
  }
}

function audienceSourceIdentity(packet) {
  return packet
    ? {
        schoolId: packet.school.id,
        terms: packet.periods.map((period) => ({
          termKind: period.termKind,
          id: period.id,
        })),
      }
    : null;
}

function reportStudents(packet) {
  if (!packet || !state.classId) return [];
  const students = new Map();
  for (const period of packet.periods) {
    const classroom = period.school.classes.find(
      (item) => item.id === state.classId,
    );
    if (!classroom) continue;
    for (const student of [
      ...(classroom.archivedStudents || []),
      ...(classroom.students || []),
    ])
      students.set(student.id, {
        ...student,
        archived: !(classroom.students || []).some(
          (item) => item.id === student.id,
        ),
      });
    for (const session of period.sessions.filter(
      (item) => item.classId === state.classId,
    )) {
      for (const student of session.roster || [])
        if (!students.has(student.id))
          students.set(student.id, { ...student, historical: true });
      for (const id of [
        ...Object.keys(session.attendance || {}),
        ...(session.scores || []).map((score) => score.studentId),
      ])
        if (!students.has(id))
          students.set(id, {
            id,
            name: "هنرجوی فاقد مشخصات",
            code: "",
            historical: true,
          });
    }
  }
  return [...students.values()];
}

function reportParticipants(session, classInfo) {
  return participants(session, classInfo).filter(
    (student) => !state.studentId || student.id === state.studentId,
  );
}

function attendance(value) {
  const match =
    typeof value === "string" ? value.match(/^late(?::(\d+))?$/) : null;
  if (match)
    return { status: "late", minutes: match[1] ? Number(match[1]) : null };
  return {
    status: ["present", "absent", "leave"].includes(value) ? value : "unknown",
    minutes: null,
  };
}

function participants(session, classInfo) {
  const known = new Map(
    [
      ...(classInfo?.students || []),
      ...(classInfo?.archivedStudents || []),
    ].map((s) => [s.id, s]),
  );
  for (const student of session.roster || []) known.set(student.id, student);
  const ids = new Set([
    ...(session.roster || classInfo?.students || []).map((s) => s.id),
    ...Object.keys(session.attendance || {}),
    ...(session.scores || []).map((score) => score.studentId),
  ]);
  return [...ids].map((id) => ({
    id,
    name: known.get(id)?.name || "هنرجوی فاقد مشخصات",
    code: known.get(id)?.code || "",
    ...attendance(session.attendance?.[id]),
    scores: (session.scores || []).filter((score) => score.studentId === id),
  }));
}

function sessions(packet) {
  return packet.periods
    .filter((period) => state.term === "all" || period.termKind === state.term)
    .flatMap((period) =>
      period.sessions
        .filter(
          (session) =>
            (!state.classId || session.classId === state.classId) &&
            (!state.from || session.date >= state.from) &&
            (!state.to || session.date <= state.to) &&
            (!state.studentId ||
              reportParticipants(
                session,
                period.school.classes.find(
                  (item) => item.id === session.classId,
                ),
              ).length > 0),
        )
        .map((session) => ({
          ...session,
          termKind: period.termKind,
          classInfo: period.school.classes.find(
            (c) => c.id === session.classId,
          ),
        })),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
}

function clearNote() {
  state.noteClass = "";
  state.noteStudent = "";
  state.noteText = "";
  state.noteOrigin = "";
  state.editing = null;
  state.noteEditorOpen = false;
}

function hasDraft() {
  return state.noteText.trim() !== (state.editing?.note || "").trim();
}

function allowDiscard() {
  return (
    !hasDraft() ||
    root.confirm(
      "متن پیگیری هنوز ذخیره نشده است. از تغییرات این یادداشت صرف‌نظر می‌کنید؟",
    )
  );
}

function notePayload(item, patch = {}) {
  return {
    id: item.id,
    version: item.version,
    streamKey: item.streamKey,
    classId: item.classId,
    studentId: item.studentId,
    note: item.note,
    status: item.status,
    ...patch,
  };
}
