// Drain live writers through explicit dependencies before activating a release.
(function (root) {
  "use strict";
  root.EduUpdatePreparation = function ({
    assertReadable,
    getContext,
    flushDrafts,
    getPeriodicReport,
    getPendingWrites,
    hasUnsavedChanges,
  }) {
    async function prepare() {
      assertReadable();
      const origin = getContext();
      const check = () => {
        assertReadable();
        const current = getContext();
        if (
          current.id !== origin.id ||
          current.connection !== origin.connection
        )
          throw Error(
            "اطلاعات هنگام آماده‌سازی به‌روزرسانی تغییر کرد؛ دوباره تلاش کنید.",
          );
      };
      for (;;) {
        check();
        await flushDrafts({ strict: true });
        const periodic = getPeriodicReport();
        if (periodic?.hasPendingNotes?.()) {
          await periodic.retryNotes?.();
          check();
          if (periodic.hasPendingNotes())
            throw Error(
              "توضیحات گزارش هنوز ذخیره نشده است؛ پیش از به‌روزرسانی ذخیرهٔ آن را دوباره امتحان کنید.",
            );
        }
        const writes = getPendingWrites();
        await writes.records;
        await writes.drafts;
        if (writes.file) await writes.file;
        check();
        const current = getPendingWrites();
        if (
          writes.records !== current.records ||
          writes.drafts !== current.drafts ||
          writes.file !== current.file
        )
          continue;
        if (getPeriodicReport()?.hasPendingNotes?.()) continue;
        if (hasUnsavedChanges())
          throw Error(
            "ویرایش ذخیره‌نشده وجود دارد؛ پیش از به‌روزرسانی آن را ذخیره یا لغو کنید.",
          );
        return true;
      }
    }
    return Object.freeze({ prepare });
  };
})(globalThis);
