        function knownStudents(c) {
          return [...c.students, ...(c.archivedStudents || [])];
        }

        function validateV24(d) {
          if (
            d.schemaVersion !== undefined &&
            (!Number.isInteger(d.schemaVersion) ||
              d.schemaVersion > 26 ||
              d.schemaVersion < 22)
          )
            throw Error("نسخه ساختار داده پشتیبانی نمی‌شود.");
          old.validateDB(d);
          if (
            d.settings?.academicYear !== undefined &&
            (typeof d.settings.academicYear !== "string" ||
              d.settings.academicYear.length > 40)
          )
            throw Error("سال تحصیلی معتبر نیست.");
          if (
            d.settings?.academicTerm !== undefined &&
            (typeof d.settings.academicTerm !== "string" ||
              d.settings.academicTerm.length > 60)
          )
            throw Error("نوبت تحصیلی معتبر نیست.");
          const classes = new Map();
          for (const s of d.schools)
            for (const c of s.classes) {
              classes.set(c.id, c);
              const ids = new Set(knownStudents(c).map((st) => st.id)),
                codes = new Set();
              for (const st of knownStudents(c)) {
                if (st.code !== undefined && typeof st.code !== "string")
                  throw Error("کد دانش‌آموز نامعتبر است.");
                if (st.code) {
                  if (codes.has(st.code))
                    throw Error("کد دانش‌آموز در کلاس تکراری است.");
                  codes.add(st.code);
                }
              }
              for (const l of c.lessons || []) {
                validateCourse(l, ids, d.settings?.academicYear);
                for (const id of Object.keys(l.kardaneshScores || {}))
                  if (!ids.has(id))
                    throw Error("نمره متعلق به دانش‌آموز ناموجود است: " + id);
                for (const p of l.poudmans)
                  for (const u of p.units)
                    for (const id of Object.keys(u.unitScores || {}))
                      if (!ids.has(id))
                        throw Error(
                          "نمره واحد متعلق به دانش‌آموز ناموجود است: " + id,
                        );
              }
            }
          for (const x of d.sessions) {
            const c = classes.get(x.classId),
              known = new Set(knownStudents(c).map((st) => st.id));
            const roster = x.roster || [];
            for (const st of roster)
              if (!known.has(st.id))
                throw Error("عضو جلسه در سوابق کلاس وجود ندارد.");
            const members = new Set(roster.map((st) => st.id));
            for (const id of [
              ...Object.keys(x.attendance),
              ...x.scores.map((sc) => sc.studentId),
            ])
              if (!known.has(id) || !members.has(id))
                throw Error("حضور یا نمره خارج از فهرست تاریخی جلسه است.");
          }
          return true;
        }

        function normalizeDB(input, { legacy = false } = {}) {
          assertSafeDataTree(input);
          if (input?.schemaVersion > 26)
            throw Error("این بانک متعلق به نسخه جدیدتر برنامه است.");
          const d = clone(input);
          const defaults = v24DefaultDB();
          d.settings = Object.assign(defaults.settings, d.settings || {});
          d.masterSchedule = d.masterSchedule || {};
          d.sessions = d.sessions || [];
          d.activeDays = d.activeDays || defaults.activeDays;
          d.periods = d.periods ?? 6;
          const warnings = [...(d.migrationWarnings || [])];
          for (const school of d.schools || [])
            for (const c of school.classes || []) {
              c.archivedStudents = c.archivedStudents || [];
              c.lessons = c.lessons || [];
              const all = new Map(knownStudents(c).map((st) => [st.id, st]));
              for (const st of all.values())
                if (st.code) st.code = asciiDigits(st.code);
              const references = new Set();
              for (const l of c.lessons) {
                l.gradeMode = l.gradeMode || "standard";
                l.kardaneshScores = l.kardaneshScores || {};
                l.weightMostamar = l.weightMostamar ?? 40;
                l.weightPayani = l.weightPayani ?? 60;
                for (const id of Object.keys(l.kardaneshScores))
                  references.add(id);
                for (const p of l.poudmans || [])
                  for (const u of p.units || []) {
                    u.unitScores = u.unitScores || {};
                    u.applyOptions = Object.assign(
                      {
                        pos: false,
                        neg: false,
                        hw: false,
                        present: false,
                        late: false,
                      },
                      u.applyOptions || {},
                    );
                    for (const id of Object.keys(u.unitScores))
                      references.add(id);
                  }
                deriveDualGrades(l);
              }
              for (const x of d.sessions.filter((x) => x.classId === c.id)) {
                for (const st of x.roster || []) references.add(st.id);
                for (const id of Object.keys(x.attendance || {}))
                  references.add(id);
                for (const sc of x.scores || []) references.add(sc.studentId);
              }
              if (legacy)
                for (const id of references)
                  if (!all.has(id)) {
                    const st = {
                      id,
                      name: "دانش‌آموز بازیابی‌شده (" + id + ")",
                      recovered: true,
                    };
                    c.archivedStudents.push(st);
                    all.set(id, st);
                    warnings.push(
                      "نام دانش‌آموز " +
                        id +
                        " در " +
                        c.name +
                        " نیازمند بررسی است.",
                    );
                  }
              for (const x of d.sessions.filter((x) => x.classId === c.id)) {
                if (!x.roster) {
                  x.roster = historicalRoster(c, x);
                } else if (legacy) {
                  const members = new Set(x.roster.map((st) => st.id));
                  for (const id of [
                    ...Object.keys(x.attendance || {}),
                    ...(x.scores || []).map((sc) => sc.studentId),
                  ])
                    if (!members.has(id) && all.has(id)) {
                      x.roster.push(clone(all.get(id)));
                      members.add(id);
                    }
                }
              }
            }
          d.schemaVersion = 26;
          d.migrationWarnings = [...new Set(warnings)];
          validateV24(d);
          return d;
        }

