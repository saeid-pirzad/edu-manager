"use strict";

// Pure policy: no file handles, browser storage, DOM, or workspace state.
globalThis.EduSingleFilePolicy = (() => {
  // Counts contain no names or grades. The last successfully published counts
  // survive reloads and detect a whole-data wipe or unusually large loss.
  function contentBaseline(snapshot) {
    const counts = {
      version: 1,
      records: 0,
      schools: 0,
      students: 0,
      lessons: 0,
      grades: 0,
      attendance: 0,
      activities: 0,
    };
    const populatedScores = (value) => {
      if (typeof value === "number") return Number.isFinite(value) ? 1 : 0;
      if (typeof value === "string") return value.trim() ? 1 : 0;
      if (!value || typeof value !== "object") return 0;
      return Object.values(value).reduce(
        (total, item) => total + populatedScores(item),
        0,
      );
    };
    const scores = (value) => {
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (
          [
            "kardaneshScores",
            "podScores",
            "unitScores",
            "competencyScores",
          ].includes(key)
        )
          counts.grades += populatedScores(item);
        else if (item && typeof item === "object") scores(item);
      }
    };
    for (const row of snapshot.stores?.records || []) {
      if (row.logical === "meta") {
        counts.schools += row.value?.layout?.length || 0;
        continue;
      }
      counts.records++;
      if (row.logical?.startsWith("class:")) {
        counts.students +=
          (row.value?.students?.length || 0) +
          (row.value?.archivedStudents?.length || 0);
        counts.lessons += row.value?.lessons?.length || 0;
        scores(row.value);
      } else if (row.logical?.startsWith("session:")) {
        counts.activities += row.value?.scores?.length || 0;
        counts.attendance += Object.values(row.value?.attendance || {}).filter(
          (value) => value !== null && value !== undefined && value !== "",
        ).length;
      }
    }
    return counts;
  }
  function sourceDropped(previous, current) {
    if (previous?.version !== 1) return false;
    const keys = Object.keys(current).filter((key) => key !== "version");
    if (
      keys.some((key) => previous[key] > 0) &&
      keys.every((key) => current[key] === 0)
    )
      return true;
    const educational = [
      "students",
      "lessons",
      "grades",
      "attendance",
      "activities",
    ];
    if (
      educational.some((key) => previous[key] > 0) &&
      educational.every((key) => current[key] === 0)
    )
      return true;
    return keys.some(
      (key) =>
        previous[key] >= 10 &&
        previous[key] - current[key] >= 10 &&
        current[key] <= previous[key] / 2,
    );
  }

  return Object.freeze({ contentBaseline, sourceDropped });
})();
