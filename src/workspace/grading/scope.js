        function deriveDualGrades(lesson) {
          for (const [id, target] of Object.entries(
            lesson.kardaneshScores || {},
          )) {
            const grade = ownScoreRecord(lesson.kardaneshScores, id);
            Object.assign(
              target,
              lesson.gradingPolicy?.method === "dual"
                ? EduPolicy.dual(
                    lesson.gradingPolicy,
                    grade.practical,
                    grade.theory,
                  )
                : weightedKardanesh(grade.practical, grade.theory),
            );
          }
        }
        function deriveClass(c) {
          for (const lesson of c.lessons) deriveDualGrades(lesson);
        }

        function checkScope(scope) {
          if (!scope.classId && !scope.sessionId) {
            for (const school of db.schools)
              for (const c of school.classes) deriveClass(c);
            validateV24(db);
            return;
          }
          const classId =
            scope.classId ||
            db.sessions.find((x) => x.id === scope.sessionId)?.classId;
          let school, selected;
          for (const s of db.schools) {
            const c = s.classes.find((c) => c.id === classId);
            if (c) {
              school = s;
              selected = c;
              break;
            }
          }
          if (!selected) throw Error("رکورد مقصد وجود ندارد.");
          deriveClass(selected);
          const tiny = {
            ...db,
            schools: [
              { id: school.id, name: school.name, classes: [selected] },
            ],
            masterSchedule: {},
            sessions: scope.sessionId
              ? db.sessions.filter((x) => x.id === scope.sessionId)
              : [],
          };
          validateV24(tiny);
        }

