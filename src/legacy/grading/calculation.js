function calcStudentLessonBase(c, lesson, stId, source = db) {
  const sess = source.sessions
    .filter((x) => x.classId === c.id && x.lessonId === lesson.id)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.period - a.period ||
        b.id.localeCompare(a.id),
    );
  const details = {};
  lesson.poudmans.forEach((p) => {
    details[p.id] = {};
    p.units.forEach((u) => {
      details[p.id][u.id] = {
        m: null,
        p: null,
        pos: 0,
        posSum: 0,
        neg: 0,
        negSum: 0,
        hw: 0,
        att: { present: 0, absent: 0, late: 0 },
        final: null,
      };
    });
  });

  let posCount = 0,
    negCount = 0,
    hwCount = 0;
  const att = { present: 0, absent: 0, late: 0 };

  sess.forEach((s) => {
    const myAtt = s.attendance[stId];
    if (myAtt) {
      if (myAtt.startsWith("late")) {
        att.late++;
        if (s.poudmanId && s.unitId && details[s.poudmanId]?.[s.unitId]) {
          details[s.poudmanId][s.unitId].att.late++;
        }
      } else if (myAtt === "present") {
        att.present++;
        if (s.poudmanId && s.unitId && details[s.poudmanId]?.[s.unitId])
          details[s.poudmanId][s.unitId].att.present++;
      } else if (myAtt === "absent") {
        att.absent++;
        if (s.poudmanId && s.unitId && details[s.poudmanId]?.[s.unitId])
          details[s.poudmanId][s.unitId].att.absent++;
      }
    }

    [...s.scores]
      .reverse()
      .filter((x) => x.studentId === stId)
      .forEach((sc) => {
        const d =
          (s.poudmanId && s.unitId && details[s.poudmanId]?.[s.unitId]) || null;
        if (sc.type === "positive") {
          posCount++;
          if (d) {
            d.pos++;
            d.posSum += Number(sc.value);
          }
        } else if (sc.type === "negative") {
          negCount++;
          if (d) {
            d.neg++;
            d.negSum += Number(sc.value);
          }
        } else if (sc.type === "homework") {
          hwCount++;
          if (d) d.hw++;
        } else if (sc.type === "mostamar" && d && d.m === null) {
          d.m = sc.value;
        } else if (sc.type === "payani" && d && d.p === null) {
          d.p = sc.value;
        }
      });
  });

  lesson.poudmans.forEach((p) => {
    p.units.forEach((u) => {
      const us = ownScoreRecord(u.unitScores, stId);
      if (us) {
        if (us.m !== undefined && us.m !== null) details[p.id][u.id].m = us.m;
        if (us.p !== undefined && us.p !== null) details[p.id][u.id].p = us.p;
      }
    });
  });

  const allM = [],
    allP = [];
  lesson.poudmans.forEach((p) => {
    p.units.forEach((u) => {
      const d = details[p.id][u.id];
      let unitFinal = null;

      const wm = lesson.weightMostamar ?? 40,
        wp = lesson.weightPayani ?? 60;
      if ((wm === 0 || d.m !== null) && (wp === 0 || d.p !== null))
        unitFinal = ((d.m ?? 0) * wm + (d.p ?? 0) * wp) / 100;

      if (unitFinal !== null) {
        let adj = 0;
        const ao = u.applyOptions || {};
        if (ao.pos) adj += d.posSum;
        if (ao.neg) adj -= d.negSum;
        if (ao.hw) adj += d.hw * 1;
        if (ao.present) adj += d.att.present * 1;
        if (ao.late) adj -= d.att.late * 1;

        unitFinal = unitFinal + adj;
        unitFinal = Math.max(0, Math.min(20, unitFinal));
      }
      d.final = unitFinal;
      if (d.m !== null) allM.push(d.m);
      if (d.p !== null) allP.push(d.p);
    });
  });

  const avgM = allM.length
    ? allM.reduce((a, b) => a + b, 0) / allM.length
    : null;
  const avgP = allP.length
    ? allP.reduce((a, b) => a + b, 0) / allP.length
    : null;

  const unitFinals = [];
  lesson.poudmans.forEach((p) =>
    p.units.forEach((u) => {
      if (details[p.id][u.id].final !== null)
        unitFinals.push(details[p.id][u.id].final);
    }),
  );
  const count = lesson.poudmans.reduce((n, p) => n + p.units.length, 0);
  const final =
    count > 0 && unitFinals.length === count
      ? unitFinals.reduce((a, b) => a + b, 0) / count
      : null;

  return { details, posCount, negCount, hwCount, att, avgM, avgP, final };
}

// ==================== تنظیمات، پشتیبان، بقیه ====================
// The persistence layer installs the settings editor and its save command.
