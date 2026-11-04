"use strict";

// A directory edit belongs to the academic year. All term records, revision
// checks and history updates are committed by the same IndexedDB transaction.
globalThis.EduAcademicDirectoryTransaction = Object.freeze({
  hasChanges({
    records,
    changed,
    removed,
    before,
    scheduleResolution = false,
  }) {
    const model = globalThis.EduAcademicYearDirectory;
    if (!model || !records?.has("meta")) return false;
    if (scheduleResolution || removed.some((key) => key.startsWith("class:")))
      return true;
    return changed.some(([key, json]) => {
      const previous = before.find((row) => row.key === key)?.value;
      const current = JSON.parse(json);
      return key === "meta"
        ? model.layoutHasChanges(
            previous?.layout || [],
            current.layout || [],
          ) || !!model.scheduleHasChanges?.(previous, current)
        : key.startsWith("class:") &&
            (model.hasChanges(previous, current) ||
              globalThis.EduAcademicYearCourses?.hasChanges(previous, current));
    });
  },

  async commit(options) {
    const {
      connection,
      records,
      changed,
      removed,
      action,
      keepUndo,
      normalizedName,
      academicTermKind,
      annualChanged,
      decodeRecords,
      historicalRoster,
      directorySourceUpdates,
    } = options;
    const workspace = { ...options.workspace },
      model = globalThis.EduAcademicYearDirectory,
      annual = globalThis.EduAnnualModules,
      courses = globalThis.EduAcademicYearCourses,
      copy = (value) => structuredClone(value),
      directoryRevisions =
        options.directoryRevisions === undefined
          ? null
          : copy(options.directoryRevisions),
      recoveredUndo =
        options.recoveredUndo === undefined
          ? null
          : copy(options.recoveredUndo),
      tx = connection.transaction(
        ["records", "catalog", "events", "undo"],
        "readwrite",
      ),
      done = globalThis.EduDataStoreRuntime.transactionDone(tx);
    let failure, nextCatalog;
    const peerUpdates = [],
      sourceUpdates = [];
    const abort = (error) => {
      failure = error;
      try {
        tx.abort();
      } catch {}
    };
    const readRows = (id) =>
      tx
        .objectStore("records")
        .getAll(IDBKeyRange.bound(id + "|", id + "}", false, true));
    const asMap = (rows, id) => {
      decodeRecords(rows, { workspaceId: id });
      return new Map(rows.map((row) => [row.logical, copy(row.value)]));
    };
    const validate = (map, id) =>
      decodeRecords(
        [...map].map(([logical, value]) => ({
          key: id + "|" + logical,
          workspace: id,
          logical,
          value,
        })),
        { workspaceId: id },
      );
    const owner = (layout, id) =>
      layout.find((school) => school.classes.includes(id))?.id;
    const freeze = (oldMap, nextMap, classId) => {
      const oldClass = oldMap.get("class:" + classId);
      if (!oldClass) return;
      for (const [key, previous] of oldMap) {
        const current = nextMap.get(key);
        if (
          !key.startsWith("session:") ||
          previous.classId !== classId ||
          previous.roster ||
          !current ||
          current.roster
        )
          continue;
        current.roster = historicalRoster(oldClass, previous);
      }
    };
    const repairRecoveredIdentity = (map, plan) => {
      const previous = new Map(
          [
            ...(plan.previous?.students || []),
            ...(plan.previous?.archivedStudents || []),
          ].map((student) => [student.id, student]),
        ),
        repaired = [
          ...(plan.current.students || []),
          ...(plan.current.archivedStudents || []),
        ].filter(
          (student) =>
            previous.get(student.id)?.recovered &&
            student.recovered === false &&
            !student.name.startsWith("دانش‌آموز بازیابی‌شده"),
        );
      for (const student of repaired) {
        // Ordinary historical names stay frozen. Only names explicitly marked
        // as migration placeholders follow the repaired shared identity.
        for (const [key, session] of map)
          if (key.startsWith("session:") && session.classId === plan.current.id)
            for (const member of session.roster || [])
              if (member.id === student.id && member.recovered) {
                member.name = student.name;
                member.recovered = false;
              }
        const unresolved = [...map].some(
          ([key, classroom]) =>
            key.startsWith("class:") &&
            [
              ...(classroom.students || []),
              ...(classroom.archivedStudents || []),
            ].some((member) => member.id === student.id && member.recovered),
        );
        const meta = map.get("meta");
        if (!unresolved && Array.isArray(meta.migrationWarnings))
          meta.migrationWarnings = meta.migrationWarnings.filter(
            (message) =>
              !message.startsWith("نام دانش‌آموز " + student.id + " در "),
          );
      }
    };
    const restoreRecoveredPeer = (oldMap, nextMap, peer, plans) => {
      const invalid = () => {
          const error = Error(
            "سابقهٔ بازگردانی نام‌های بازیابی‌شده با اطلاعات نوبت‌های سال سازگار نیست؛ تغییری انجام نشد.",
          );
          error.code = "ACADEMIC_DIRECTORY_CONFLICT";
          throw error;
        },
        corrections = new Map();
      for (const plan of plans) {
        const previous = new Map(
          [
            ...(plan.previous?.students || []),
            ...(plan.previous?.archivedStudents || []),
          ].map((student) => [student.id, student]),
        );
        for (const student of [
          ...(plan.current.students || []),
          ...(plan.current.archivedStudents || []),
        ]) {
          const corrected = previous.get(student.id);
          if (
            student.recovered === true &&
            corrected?.recovered === false &&
            student.name.startsWith("دانش‌آموز بازیابی‌شده")
          )
            corrections.set(plan.current.id + "|" + student.id, {
              previous: student,
              corrected,
            });
        }
      }
      if (!peer || !Array.isArray(peer.rosters) || !corrections.size) invalid();
      const correct = (roster, classId) => {
        const expected = copy(roster);
        for (const member of expected) {
          const change = corrections.get(classId + "|" + member.id);
          if (!change || !member.recovered) continue;
          member.name = change.corrected.name;
          member.recovered = false;
        }
        return expected;
      };
      for (const row of peer.rosters) {
        const key = "session:" + row.sessionId,
          original = oldMap.get(key),
          current = nextMap.get(key),
          classroom = nextMap.get("class:" + row.classId);
        if (
          !original ||
          !current ||
          !classroom ||
          original.classId !== row.classId ||
          ![...corrections.keys()].some((id) =>
            id.startsWith(row.classId + "|"),
          ) ||
          (row.before !== null && !Array.isArray(row.before))
        )
          invalid();
        const before =
          row.before === null
            ? historicalRoster(classroom, original)
            : row.before;
        if (
          JSON.stringify(correct(before, row.classId)) !==
          JSON.stringify(original.roster)
        )
          invalid();
        if (row.before === null) delete current.roster;
        else current.roster = copy(row.before);
      }
      if (peer.migrationWarnings !== undefined) {
        const current = oldMap.get("meta").migrationWarnings || [],
          prefixes = [...corrections.values()].map(
            (change) => "نام دانش‌آموز " + change.previous.id + " در ",
          );
        let position = 0;
        if (!Array.isArray(peer.migrationWarnings)) invalid();
        for (const message of peer.migrationWarnings) {
          if (message === current[position]) position++;
          else if (!prefixes.some((prefix) => message.startsWith(prefix)))
            invalid();
        }
        if (position !== current.length) invalid();
        nextMap.get("meta").migrationWarnings = copy(peer.migrationWarnings);
      }
    };
    try {
      const request = tx.objectStore("catalog").getAll();
      request.onsuccess = () => {
        try {
          const catalog = request.result,
            live = catalog.find((row) => row.id === workspace.id);
          if (!live || live.revision !== workspace.revision) {
            const error = Error(
              "اطلاعات در پنجرهٔ دیگری تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.",
            );
            error.code = "WORKSPACE_CONFLICT";
            throw error;
          }
          const meta = records.get("meta"),
            year = meta?.settings?.academicYear ?? live.year,
            term = meta?.settings?.academicTerm ?? live.term;
          if (
            year !== live.year &&
            catalog.some((row) => row.id !== live.id && row.year === live.year)
          )
            throw Error(
              "سال تحصیلی دارای نوبت مشترک است؛ تغییر سال و فهرست را هم‌زمان انجام ندهید.",
            );
          if (
            catalog.some(
              (row) =>
                row.id !== live.id &&
                row.year === year &&
                normalizedName(row.term) === normalizedName(term),
            )
          )
            throw Error("عنوان نوبت در این سال تکراری است.");
          const family = catalog.filter(
              (row) => row.id === live.id || row.year === year,
            ),
            loaded = new Map();
          if (directoryRevisions !== null) {
            const valid =
                Array.isArray(directoryRevisions) &&
                directoryRevisions.every(
                  (row) =>
                    row &&
                    typeof row.id === "string" &&
                    row.year === year &&
                    Number.isSafeInteger(row.revision) &&
                    row.revision > 0,
                ),
              signature = (rows) =>
                JSON.stringify(
                  rows
                    .map((row) => [row.id, row.year, row.revision])
                    .sort(([a], [b]) => a.localeCompare(b)),
                );
            if (!valid || signature(directoryRevisions) !== signature(family)) {
              const error = Error(
                "فهرست یکی از نوبت‌های سال پس از تهیهٔ پشتیبان ایمنی تغییر کرده است؛ عملیات انجام نشد. صفحه را دوباره بارگذاری کنید.",
              );
              error.code = "WORKSPACE_CONFLICT";
              throw error;
            }
          }
          let pending = family.length;
          for (const period of family) {
            const rows = readRows(period.id);
            rows.onsuccess = () => {
              try {
                loaded.set(period.id, asMap(rows.result, period.id));
                if (--pending) return;
                apply(family, live, year, term, loaded);
              } catch (error) {
                abort(error);
              }
            };
          }
        } catch (error) {
          abort(error);
        }
      };
    } catch (error) {
      abort(error);
    }

    function apply(family, live, year, term, loaded) {
      nextCatalog = live;
      if (options.scheduleResolution && directoryRevisions === null)
        throw Error(
          "برای یکسان‌سازی برنامهٔ سال، ابتدا پشتیبان کامل و نسخهٔ نوبت‌ها را بررسی کنید.",
        );
      if (recoveredUndo !== null) {
        const signature = (rows) =>
          JSON.stringify(
            rows
              .map((row) => [row.id, row.revision])
              .sort(([a], [b]) => a.localeCompare(b)),
          );
        if (
          keepUndo ||
          !Array.isArray(recoveredUndo) ||
          signature(recoveredUndo) !==
            signature(family.filter((period) => period.id !== live.id))
        ) {
          const error = Error(
            "یکی از نوبت‌های سال پس از اصلاح نام تغییر کرده است؛ بازگردانی انجام نشد.",
          );
          error.code = "WORKSPACE_CONFLICT";
          throw error;
        }
      }
      const sourceOld = loaded.get(live.id),
        sourceNext = new Map(
          [...sourceOld].map(([key, value]) => [key, copy(value)]),
        );
      for (const [key, json] of changed) sourceNext.set(key, JSON.parse(json));
      for (const key of removed) sourceNext.delete(key);
      const previousLayout = sourceOld.get("meta").layout,
        currentLayout = sourceNext.get("meta").layout,
        layoutChanged = model.layoutHasChanges(previousLayout, currentLayout),
        scheduleChanged =
          !!options.scheduleResolution ||
          !!model.scheduleHasChanges?.(
            sourceOld.get("meta"),
            sourceNext.get("meta"),
          ),
        classPlans = changed
          .filter(([key]) => key.startsWith("class:"))
          .map(([key]) => ({
            key,
            previous: sourceOld.get(key),
            current: sourceNext.get(key),
          })),
        directoryPlans = classPlans.filter((plan) =>
          model.hasChanges(plan.previous, plan.current),
        ),
        coursePlans = courses
          ? classPlans.filter((plan) =>
              courses.hasChanges(plan.previous, plan.current),
            )
          : [],
        deletedClasses = removed.filter((key) => key.startsWith("class:")),
        sharedClassRemoval =
          deletedClasses.length > 0 &&
          family.some(
            (period) =>
              period.id !== live.id &&
              deletedClasses.some((key) => loaded.get(period.id).has(key)),
          );
      const recoveredClasses = new Set(
        directoryPlans
          .filter((plan) => {
            const previous = new Map(
              [
                ...(plan.previous?.students || []),
                ...(plan.previous?.archivedStudents || []),
              ].map((student) => [student.id, student]),
            );
            return [
              ...(plan.current.students || []),
              ...(plan.current.archivedStudents || []),
            ].some(
              (student) =>
                previous.get(student.id)?.recovered &&
                student.recovered === false &&
                !student.name.startsWith("دانش‌آموز بازیابی‌شده"),
            );
          })
          .map((plan) => plan.current.id),
      );
      if (
        annual &&
        ["first", "second"].includes(
          live.termKind || academicTermKind(live.term),
        ) &&
        classPlans.some((plan) =>
          annual.hasChanges(plan.previous, plan.current),
        )
      ) {
        const roles = new Set();
        for (const period of family) {
          const kind = period.termKind || academicTermKind(period.term);
          if (!["first", "second"].includes(kind)) continue;
          if (roles.has(kind))
            throw Error(
              "نوبت‌های سال برای ثبت نمرهٔ سالانه تکراری‌اند؛ ابتدا نوبت‌های متعارض را بررسی کنید.",
            );
          roles.add(kind);
        }
      }
      const sharedCourseRemoval = coursePlans.some((plan) => {
        const nextIds = new Set(
            (plan.current.lessons || []).map((lesson) => lesson.id),
          ),
          removedIds = (plan.previous?.lessons || [])
            .filter((lesson) => !nextIds.has(lesson.id))
            .map((lesson) => lesson.id);
        return (
          removedIds.length &&
          family.some(
            (period) =>
              period.id !== live.id &&
              (loaded.get(period.id).get(plan.key)?.lessons || []).some(
                (lesson) => removedIds.includes(lesson.id),
              ),
          )
        );
      });
      const sessionsFrom = (map) =>
        [...map]
          .filter(([key]) => key.startsWith("session:"))
          .map(([, value]) => value);
      const pruneLessonSchedule = (map, classId, previous, current) => {
        const currentIds = new Set(
            (current?.lessons || []).map((lesson) => lesson.id),
          ),
          deleted = new Set(
            (previous?.lessons || [])
              .filter((lesson) => !currentIds.has(lesson.id))
              .map((lesson) => lesson.id),
          );
        for (const [slot, value] of Object.entries(
          map.get("meta").masterSchedule || {},
        ))
          if (value.classId === classId && deleted.has(value.lessonId))
            delete map.get("meta").masterSchedule[slot];
      };
      for (const plan of coursePlans) {
        // Validate the source against its persisted history as well as every
        // companion; the returned target scores are deliberately ignored here.
        courses.mirrorClass(plan.previous, plan.current, plan.previous, {
          sessions: sessionsFrom(sourceOld),
        });
        pruneLessonSchedule(
          sourceNext,
          plan.current.id,
          plan.previous,
          plan.current,
        );
      }
      for (const plan of directoryPlans) {
        freeze(sourceOld, sourceNext, plan.current.id);
        repairRecoveredIdentity(sourceNext, plan);
      }
      // Undo of an addition may remove its identity only while it has no
      // references in any term. Enrollment with history must be archived.
      for (const plan of directoryPlans) {
        const incoming = new Set(
          [
            ...(plan.current.students || []),
            ...(plan.current.archivedStudents || []),
          ].map((student) => student.id),
        );
        const deleted = [
          ...(plan.previous?.students || []),
          ...(plan.previous?.archivedStudents || []),
        ].filter((student) => !incoming.has(student.id));
        for (const student of deleted)
          for (const old of loaded.values()) {
            const classroom = old.get(plan.key);
            if (!classroom) continue;
            const inSession = [...old].some(
              ([key, value]) =>
                key.startsWith("session:") &&
                value.classId === classroom.id &&
                ((value.roster || historicalRoster(classroom, value)).some(
                  (member) => member.id === student.id,
                ) ||
                  Object.hasOwn(value.attendance || {}, student.id) ||
                  value.scores?.some(
                    (score) => score.studentId === student.id,
                  )),
            );
            const inGrade = (classroom.lessons || []).some(
              (lesson) =>
                Object.hasOwn(lesson.kardaneshScores || {}, student.id) ||
                (lesson.poudmans || []).some(
                  (pod) =>
                    Object.hasOwn(pod.podScores || {}, student.id) ||
                    (pod.units || []).some((unit) =>
                      Object.hasOwn(unit.unitScores || {}, student.id),
                    ),
                ),
            );
            if (inSession || inGrade) {
              const error = Error(
                "هنرجوی «" +
                  student.name +
                  "» در یکی از نوبت‌ها سابقه دارد؛ به‌جای حذف کامل، او را بایگانی کنید.",
              );
              error.code = "ACADEMIC_DIRECTORY_CONFLICT";
              throw error;
            }
          }
      }
      const prepared = [{ period: live, old: sourceOld, next: sourceNext }];
      for (const period of family) {
        if (period.id === live.id) continue;
        const old = loaded.get(period.id),
          next = new Map([...old].map(([key, value]) => [key, copy(value)])),
          peerMeta = next.get("meta");
        if (scheduleChanged)
          Object.assign(
            peerMeta,
            model.mirrorSchedule(
              sourceOld.get("meta"),
              sourceNext.get("meta"),
              peerMeta,
              { replace: !!options.scheduleResolution },
            ),
          );
        if (layoutChanged)
          peerMeta.layout = model.mirrorLayout(
            previousLayout,
            currentLayout,
            peerMeta.layout,
          );
        for (const key of deletedClasses) {
          const classroom = old.get(key);
          if (!classroom) continue;
          if (!keepUndo) {
            const sourceClass = sourceOld.get(key),
              peerSchedule = Object.values(
                old.get("meta").masterSchedule || {},
              ).some((slot) => slot.classId === classroom.id);
            if (
              JSON.stringify(classroom.lessons || []) !==
                JSON.stringify(sourceClass?.lessons || []) ||
              peerSchedule
            ) {
              const error = Error(
                "کلاس «" +
                  classroom.name +
                  "» در نوبت دیگر تعریف درس یا برنامهٔ هفتگی مستقل دارد؛ بازگردانی افزودن کلاس انجام نشد. برای حذف، از مسیر حذف کلاس و پشتیبان کامل استفاده کنید.",
              );
              error.code = "ACADEMIC_DIRECTORY_CONFLICT";
              throw error;
            }
          }
          model.assertClassRemovable(
            classroom,
            [...old]
              .filter(([logical]) => logical.startsWith("session:"))
              .map(([, value]) => value),
          );
          next.delete(key);
          for (const [slot, value] of Object.entries(
            peerMeta.masterSchedule || {},
          ))
            if (value.classId === classroom.id)
              delete peerMeta.masterSchedule[slot];
        }
        for (const plan of directoryPlans) {
          const classId = plan.current.id,
            sourceOwner = owner(currentLayout, classId),
            targetOwner = owner(peerMeta.layout, classId);
          if (!sourceOwner || targetOwner !== sourceOwner)
            throw Error("مالک کلاس در فهرست مشترک سال تحصیلی سازگار نیست.");
          const target = next.get(plan.key);
          freeze(old, next, classId);
          next.set(
            plan.key,
            model.mirrorClass(plan.previous, plan.current, target, {
              allowRemoval: true,
            }),
          );
          repairRecoveredIdentity(next, plan);
        }
        for (const plan of coursePlans) {
          const classId = plan.current.id;
          if (
            !owner(currentLayout, classId) ||
            owner(currentLayout, classId) !== owner(peerMeta.layout, classId)
          )
            throw Error(
              "مالک کلاس برای اشتراک درس‌های سال تحصیلی سازگار نیست.",
            );
          const target = next.get(plan.key),
            value = courses.mirrorClass(plan.previous, plan.current, target, {
              sessions: sessionsFrom(old),
            });
          if (!keepUndo) {
            const surviving = new Set(
                (value.lessons || []).map((lesson) => lesson.id),
              ),
              removed = new Set(
                (target?.lessons || [])
                  .filter((lesson) => !surviving.has(lesson.id))
                  .map((lesson) => lesson.id),
              );
            if (
              Object.values(old.get("meta").masterSchedule || {}).some(
                (slot) =>
                  slot.classId === classId && removed.has(slot.lessonId),
              )
            ) {
              const error = Error(
                "این درس در نوبت دیگر برنامهٔ هفتگی دارد؛ برای حذف از مسیر حذف درس و پشتیبان کامل استفاده کنید.",
              );
              error.code = "ACADEMIC_COURSE_CONFLICT";
              throw error;
            }
          }
          pruneLessonSchedule(next, classId, target, value);
          next.set(plan.key, value);
        }
        // The existing annual modular rule remains applicable to combined
        // enrollment and grade edits, without copying term-specific grades.
        const sourceKind = live.termKind || academicTermKind(live.term),
          targetKind = period.termKind || academicTermKind(period.term);
        if (
          annual &&
          ["first", "second"].includes(sourceKind) &&
          ["first", "second"].includes(targetKind)
        )
          for (const plan of classPlans) {
            const target = next.get(plan.key);
            if (
              target &&
              owner(currentLayout, plan.current.id) ===
                owner(peerMeta.layout, plan.current.id) &&
              annual.hasChanges(plan.previous, plan.current)
            ) {
              const value = annual.mirrorClass(
                plan.previous,
                plan.current,
                target,
              );
              if (value) next.set(plan.key, value);
            }
          }
        if (recoveredUndo !== null)
          restoreRecoveredPeer(
            old,
            next,
            recoveredUndo.find((peer) => peer.id === period.id),
            directoryPlans,
          );
        validate(next, period.id);
        prepared.push({ period, old, next });
      }
      // A successful edit must leave the entire family with one directory.
      if (prepared.length > 1) {
        const layout = JSON.stringify(currentLayout);
        for (const part of prepared) {
          if (JSON.stringify(part.next.get("meta").layout) !== layout) {
            const error = Error(
              "چیدمان مدرسه و کلاس‌ها بین نوبت‌های این سال متفاوت است؛ ابتدا اختلاف فهرست را اصلاح کنید.",
            );
            error.code = "ACADEMIC_DIRECTORY_CONFLICT";
            throw error;
          }
          for (const school of currentLayout)
            for (const id of school.classes) {
              const source = sourceNext.get("class:" + id),
                target = part.next.get("class:" + id);
              if (
                !source ||
                !target ||
                JSON.stringify(model.projection(source)) !==
                  JSON.stringify(model.projection(target))
              ) {
                const error = Error(
                  "فهرست کلاس «" +
                    (source?.name || id) +
                    "» بین نوبت‌های سال متفاوت است؛ ابتدا نام، کد و عضویت هنرجویان را یکسان کنید.",
                );
                error.code = "ACADEMIC_DIRECTORY_CONFLICT";
                throw error;
              }
            }
        }
      }
      if (courses && coursePlans.length && prepared.length > 1)
        for (const part of prepared)
          for (const plan of coursePlans) {
            const candidate = part.next.get(plan.key);
            if (
              !candidate ||
              JSON.stringify(courses.projection(candidate)) !==
                JSON.stringify(courses.projection(plan.current))
            ) {
              const error = Error(
                "تعریف درس‌های کلاس «" +
                  plan.current.name +
                  "» بین نوبت‌های سال یکسان نیست؛ تغییر ثبت نشد.",
              );
              error.code = "ACADEMIC_COURSE_CONFLICT";
              throw error;
            }
          }
      if (scheduleChanged)
        for (const part of prepared)
          if (
            model.scheduleHasChanges(
              sourceNext.get("meta"),
              part.next.get("meta"),
            )
          ) {
            const error = Error(
              "برنامهٔ هفتگی نوبت‌های سال متفاوت است؛ برای انتخاب صریح برنامهٔ درست از «یکسان‌سازی برنامهٔ سال تحصیلی» استفاده کنید.",
            );
            error.code = "ACADEMIC_SCHEDULE_CONFLICT";
            throw error;
          }
      validate(sourceNext, live.id);
      const sessionSlots = globalThis.EduSessionSlots,
        sessionChanges = sessionSlots?.changes({
          changed,
          before: options.before,
          removed,
          restoredRecords: options.restoredSessionRecords,
        });
      if (sessionChanges?.guarded.length) {
        sessionSlots.assertScheduled(sessionChanges, sourceNext.get("meta"));
        sessionSlots.assertAvailable(
          sessionChanges,
          live.id,
          prepared
            .filter(
              ({ period }) =>
                period.id === live.id ||
                ["first", "second"].includes(
                  period.termKind || academicTermKind(period.term),
                ),
            )
            .map(({ period, next }) => ({ id: period.id, records: next })),
        );
      }
      for (const part of prepared)
        part.plan = globalThis.EduRecordCommitPlan.create(
          part.next,
          new Map(
            [...part.old].map(([key, value]) => [key, JSON.stringify(value)]),
          ),
          { replace: true },
        );
      const recoveredPeers =
        recoveredClasses.size && prepared.length > 1
          ? prepared
              .filter((part) => part.period.id !== live.id)
              .map((part) => {
                const rosters = [];
                for (const [key, value] of part.next) {
                  if (
                    !key.startsWith("session:") ||
                    !recoveredClasses.has(value.classId)
                  )
                    continue;
                  const previous = part.old.get(key);
                  if (
                    previous &&
                    JSON.stringify(previous.roster) !==
                      JSON.stringify(value.roster)
                  )
                    rosters.push({
                      sessionId: value.id,
                      classId: value.classId,
                      before: copy(previous.roster ?? null),
                    });
                }
                const previousWarnings = part.old.get("meta").migrationWarnings,
                  nextWarnings = part.next.get("meta").migrationWarnings;
                return {
                  id: part.period.id,
                  revision:
                    part.period.revision +
                    (part.plan.changed.length || part.plan.removed.length
                      ? 1
                      : 0),
                  rosters,
                  ...(JSON.stringify(previousWarnings) !==
                  JSON.stringify(nextWarnings)
                    ? { migrationWarnings: copy(previousWarnings) }
                    : {}),
                };
              })
          : null;
      const at = new Date().toISOString(),
        resolutionChanged =
          !!options.scheduleResolution &&
          prepared.some(
            (part) => part.plan.changed.length || part.plan.removed.length,
          );
      for (const part of prepared) {
        const plan = part.plan,
          isSource = part.period.id === live.id;
        if (
          !plan.changed.length &&
          !plan.removed.length &&
          !(isSource && resolutionChanged)
        )
          continue;
        for (const [logical, json] of plan.changed)
          tx.objectStore("records").put({
            key: part.period.id + "|" + logical,
            workspace: part.period.id,
            logical,
            value: JSON.parse(json),
          });
        for (const logical of plan.removed)
          tx.objectStore("records").delete(part.period.id + "|" + logical);
        const updated = {
          ...part.period,
          ...(isSource
            ? {
                year,
                term,
                termKind: live.termKind || academicTermKind(live.term),
              }
            : {}),
          revision: part.period.revision + 1,
          updatedAt: at,
        };
        if (!Number.isSafeInteger(updated.revision))
          throw Error("شمارهٔ نسخهٔ اطلاعات قابل افزایش نیست.");
        tx.objectStore("catalog").put(updated);
        tx.objectStore("events").add({
          workspace: updated.id,
          revision: updated.revision,
          at,
          action: isSource
            ? action
            : scheduleChanged
              ? "همگام‌سازی برنامهٔ هفتگی سال تحصیلی"
              : "همگام‌سازی فهرست مشترک سال تحصیلی",
          changes: plan.changes,
        });
        // A source-only undo cannot reconstruct a removed companion
        // class's independent courses/schedule. Recovery uses the full
        // safety backup prepared by the deletion flow.
        if (isSource && keepUndo && !sharedClassRemoval && !sharedCourseRemoval)
          tx.objectStore("undo").put({
            id: updated.id,
            action,
            revision: updated.revision,
            before: plan.before,
            ...(recoveredPeers ? { recoveredPeers } : {}),
          });
        else tx.objectStore("undo").delete(updated.id);
        if (isSource) {
          nextCatalog = updated;
          sourceUpdates.push(
            ...plan.changed.map(([key, json]) => [key, JSON.parse(json)]),
          );
        } else
          peerUpdates.push({
            workspace: updated.id,
            revision: updated.revision,
          });
      }
    }
    try {
      await done;
    } catch (error) {
      throw failure || error;
    }
    // Publish only after transaction completion; aborted writes never leak into
    // the caller's committed snapshot or live session rosters.
    for (const [key, value] of sourceUpdates) {
      const index = changed.findIndex(([logical]) => logical === key),
        entry = [key, JSON.stringify(value)];
      if (index < 0) changed.push(entry);
      else changed[index] = entry;
    }
    if (directorySourceUpdates) directorySourceUpdates.push(...sourceUpdates);
    if (annualChanged) annualChanged.push(...peerUpdates);
    return nextCatalog;
  },
});
