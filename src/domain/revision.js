// Revisions are exact counters, not grades or student data. Never persist an
// increment that JavaScript can no longer represent as a safe integer.
(function (root) {
  "use strict";
  function next(revision) {
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw Object.assign(Error("شمارهٔ نسخهٔ اطلاعات معتبر نیست."), {
        code: "REVISION_INVALID",
      });
    if (revision === Number.MAX_SAFE_INTEGER)
      throw Object.assign(
        Error("شمارهٔ نسخهٔ اطلاعات به حد مجاز رسیده است؛ تغییر ثبت نشد."),
        { code: "REVISION_LIMIT_REACHED" },
      );
    return revision + 1;
  }
  root.EduRevision = Object.freeze({ next });
})(globalThis);
