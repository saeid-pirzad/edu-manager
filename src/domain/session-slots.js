"use strict";

// A physical class meeting belongs to a date and bell, not to its term's
// storage identity. Only new/moved slots are guarded: existing legacy overlaps
// remain readable and their attendance or activities can still be corrected.
globalThis.EduSessionSlots = Object.freeze({
  changes({ changed, before, removed, restoredRecords = null }) {
    const updates = changed
        .filter(([logical]) => logical.startsWith("session:"))
        .map(([logical, json]) => ({ logical, value: JSON.parse(json), json })),
      guarded = updates.filter(({ logical, value, json }) => {
        const previous = before.find((row) => row.key === logical)?.value;
        if (
          previous &&
          previous.classId === value.classId &&
          previous.date === value.date &&
          previous.period === value.period
        )
          return false;
        // This map comes only from the already validated historical undo,
        // never from a public save scope or a caller-supplied allow flag.
        return JSON.stringify(restoredRecords?.get(logical)) !== json;
      });
    return {
      updates,
      guarded,
      removed: removed.filter((logical) => logical.startsWith("session:")),
    };
  },

  assertAvailable(changes, workspaceId, parts) {
    if (!changes.guarded.length) return;
    const family = parts.map((part) => {
      const records = new Map(part.records);
      if (part.id === workspaceId) {
        for (const { logical, value } of changes.updates)
          records.set(logical, value);
        for (const logical of changes.removed) records.delete(logical);
      }
      return { id: part.id, records };
    });
    for (const { logical, value } of changes.guarded)
      for (const part of family)
        for (const [key, session] of part.records) {
          if (
            !key.startsWith("session:") ||
            (part.id === workspaceId && key === logical)
          )
            continue;
          if (
            session.classId === value.classId &&
            session.date === value.date &&
            session.period === value.period
          ) {
            const error = Error(
              "تداخل جلسه: برای همین کلاس، تاریخ و زنگ قبلاً جلسه ثبت شده است؛ ترم و جلسهٔ قبلی را بررسی یا تاریخ و زنگ را اصلاح کنید. هیچ تغییری ذخیره نشد.",
            );
            error.code = "ACADEMIC_SESSION_SLOT_CONFLICT";
            throw error;
          }
        }
  },
});
