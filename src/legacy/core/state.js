      function getSortedStudents(classObj) {
        if (!classObj || !classObj.students) return [];
        const collator = new Intl.Collator("fa", { sensitivity: "base" });
        return [...classObj.students].sort((a, b) => {
          const aParts = a.name.trim().split(" ");
          const bParts = b.name.trim().split(" ");
          const aFamily =
            aParts.length > 1 ? aParts[aParts.length - 1] : a.name;
          const bFamily =
            bParts.length > 1 ? bParts[bParts.length - 1] : b.name;
          const familyCompare = collator.compare(aFamily, bFamily);
          if (familyCompare !== 0) return familyCompare;
          return collator.compare(a.name, b.name);
        });
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
        tab: "students",
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

