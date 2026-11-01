// Read one consistent academic-year snapshot for course-editor locks.
// The write transaction repeats the checks against live records.
async function academicCourseHistory(classId, lessonId) {
  if (!lessonId) return { hasGrades: false, hasSessions: false };
  const origin = {
    id: workspace?.id,
    revision: workspace?.revision,
    year: workspace?.year,
    connection,
  };
  const check = () => {
    if (
      connection !== origin.connection ||
      workspace?.id !== origin.id ||
      workspace?.revision !== origin.revision ||
      periodLoading ||
      resetBusy ||
      connectionRetired
    )
      throw Error(
        "سال یا اطلاعات درس هنگام بررسی سوابق تغییر کرد؛ فرم را دوباره باز کنید.",
      );
  };
  check();
  const tx = origin.connection.transaction(["catalog", "records"], "readonly"),
    done = transactionDone(tx);
  const pending = new Promise((resolve, reject) => {
    try {
      const request = tx.objectStore("catalog").getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        try {
          check();
          const periods = request.result.filter(
            (period) => period.year === origin.year,
          );
          Promise.all(
            periods.map(async (period) => {
              const rows = await requestPromise(
                workspaceRecordRequest(tx.objectStore("records"), period.id),
              );
              const data = decodeWorkspaceRecords(rows, {
                  workspaceId: period.id,
                }).data,
                classroom = data.schools
                  .flatMap((school) => school.classes)
                  .find((item) => item.id === classId),
                lesson = classroom?.lessons.find(
                  (item) => item.id === lessonId,
                ),
                sessions = data.sessions.filter(
                  (session) =>
                    session.classId === classId &&
                    session.lessonId === lessonId,
                );
              return {
                hasSessions: sessions.length > 0,
                hasGrades:
                  !!lesson &&
                  (EduPolicy.hasGrades(lesson) ||
                    sessions.some((session) => session.scores.length > 0)),
              };
            }),
          ).then(resolve, reject);
        } catch (error) {
          reject(error);
          tx.abort();
        }
      };
    } catch (error) {
      reject(error);
      tx.abort();
    }
  });
  const [parts] = await Promise.all([pending, done]);
  check();
  return {
    hasGrades: parts.some((part) => part.hasGrades),
    hasSessions: parts.some((part) => part.hasSessions),
  };
}
