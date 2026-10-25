      function downloadRawRecovery() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return alert("نسخه خامی وجود ندارد.");
        downloadLocalFile(
          new Blob([raw], { type: "application/json" }),
          "school-raw-recovery.json",
        );
      }

      function snapshotRoster(c) {
        return c.students.map((st) => ({
          id: st.id,
          name: st.name,
          code: st.code || "",
        }));
      }

      function sessionStudents(c, x) {
        return x.roster || [...c.students, ...(c.archivedStudents || [])];
      }

      function validateReportNotes(value, workspaceId) {
        if (value === undefined) return {};
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw Error("بخش توضیحات گزارش در پشتیبان معتبر نیست.");
        for (const [key, text] of Object.entries(value))
          if (
            typeof text !== "string" ||
            !key.startsWith(workspaceId + "|") ||
            key.split("|").length !== 7
          )
            throw Error("توضیحات گزارش با دوره پشتیبان سازگار نیست.");
        return Object.fromEntries(Object.entries(value));
      }
      function historicalRoster(c, session) {
        const recorded = new Set([
          ...Object.keys(session.attendance || {}),
          ...(session.scores || []).map((score) => score.studentId),
        ]);
        if (!recorded.size) return snapshotRoster(c);
        const known = new Map(
          [...c.students, ...(c.archivedStudents || [])].map((student) => [
            student.id,
            student,
          ]),
        );
        return [...recorded].map((id) => {
          const student = known.get(id);
          if (!student)
            throw Error("عضو ثبت‌شده در جلسه، در سوابق کلاس وجود ندارد: " + id);
          return structuredClone(student);
        });
      }

      function archiveStudent(c, st) {
        db.sessions
          .filter((x) => x.classId === c.id)
          .forEach((x) => {
            if (!x.roster) x.roster = historicalRoster(c, x);
          });
        (c.archivedStudents || (c.archivedStudents = [])).push({ ...st });
        c.students = c.students.filter((x) => x.id !== st.id);
      }

