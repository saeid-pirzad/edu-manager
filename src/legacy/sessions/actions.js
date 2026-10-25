      async function deleteSession(sessId) {
        if (
          !confirm(
            "آیا از حذف این جلسه مطمئن هستید؟ اطلاعات حضور و نمرات آن پاک خواهد شد.",
          )
        )
          return;
        db.sessions = db.sessions.filter((s) => s.id !== sessId);
        await saveDB();
        render();
      }

      async function deleteAllSessions(classId, lessonId) {
        if (
          !confirm(
            "⚠️ هشدار: آیا از حذف تمام جلسات این درس مطمئن هستید؟ تمام حضور و غیاب‌ها و نمرات ثبت شده در این جلسات برای همیشه پاک می‌شوند.",
          )
        )
          return;
        db.sessions = db.sessions.filter(
          (s) => !(s.classId === classId && s.lessonId === lessonId),
        );
        await saveDB();
        render();
      }

      async function addManualSession(e, lessonId) {
        e.preventDefault();
        const c = getClassObj(state.schoolId, state.classId);
        const date = e.target.date.value;
        const period = parseInt(e.target.period.value) - 1;
        if (!date || isNaN(period) || period < 0)
          return alert("اطلاعات نامعتبر");
        const existing = db.sessions.find(
          (s) => s.classId === c.id && s.date === date && s.period === period,
        );
        if (existing) {
          const existingLesson = getLessonObj(c, existing.lessonId);
          const message =
            existing.lessonId === lessonId
              ? "جلسه همین درس در این تاریخ و زنگ وجود دارد. ادامه داده شود؟"
              : "این زنگ به درس «" +
                (existingLesson?.name || "درس دیگر") +
                "» تعلق دارد، نه «" +
                (getLessonObj(c, lessonId)?.name || "درس انتخاب‌شده") +
                "».\n" +
                faDate(date) +
                "، زنگ " +
                (period + 1) +
                "\nآیا وارد جلسه درس «" +
                (existingLesson?.name || "درس دیگر") +
                "» می‌شوید؟";
          if (confirm(message)) openSessionModal(existing);
          return;
        }
        const newSession = {
          id: uid(),
          schoolId: state.schoolId,
          classId: c.id,
          date,
          period,
          lessonId,
          poudmanId: null,
          unitId: null,
          attendance: {},
          scores: [],
          roster: snapshotRoster(c),
        };
        db.sessions.push(newSession);
        await saveDB({ sessionId: newSession.id });
        openSessionModal(newSession);
      }

