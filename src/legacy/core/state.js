// Registration order is the roster order, including rows imported from CSV.
function getSortedStudents(classObj) {
  return [...(classObj?.students || [])];
}

function makeDefaultPoudmans() {
  return Array.from({ length: 5 }, (_, i) => ({
    id: "p" + uid() + i,
    name: "پودمان " + (i + 1),
    units: [
      {
        id: "u" + uid() + i + "a",
        name: "واحد ۱",
        unitScores: {},
        applyOptions: {
          pos: false,
          neg: false,
          hw: false,
          present: false,
          late: false,
        },
      },
      {
        id: "u" + uid() + i + "b",
        name: "واحد ۲",
        unitScores: {},
        applyOptions: {
          pos: false,
          neg: false,
          hw: false,
          present: false,
          late: false,
        },
      },
    ],
  }));
}
function legacy_defaultDB() {
  return {
    schools: [],
    sessions: [],
    masterSchedule: {},
    activeDays: [0, 1, 2, 3, 4, 5],
    periods: 6,
    settings: {
      weekStartDate: todayISO(),
      academicYear: "۱۴۰۳-۱۴۰۴",
      password: "",
    },
  };
}
let storageSnapshot = null,
  storageBlocked = false,
  storageProblem = "";
let db = loadDB();
let state = {
  view: "schools",
  schoolId: null,
  classId: null,
  lessonId: null,
  tab: "lessons",
  masterFilter: null,
  reportTab: "comprehensive",
};
let currentSessionId = null;
let isAuthenticated = false;

let globalFilter = {
  schoolId: "",
  classId: "",
  lessonId: "",
  studentId: "",
  period: "",
  date: "",
  showAttendance: true,
  showScores: true,
  showPosNeg: true,
  showHomework: true,
  reportMode: "detailed",
  showPresentNames: true,
  showAbsentNames: true,
  showLateNames: true,
};
let lessonReportFilter = { schoolId: "", classId: "", lessonId: "" };
let karnamehFilter = { schoolId: "", classId: "", studentId: "" };
