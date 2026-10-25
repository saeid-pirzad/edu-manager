"use strict";

// History is descriptive: never copy raw password fields into audit events.
globalThis.EduHistoryChanges = (() => {
  const passwordLabel = value => value ? "رمز تنظیم‌شده" : "بدون رمز";
  function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key, key === "password" ? passwordLabel(item) : redact(item),
      ]));
    return value === undefined ? null : value;
  }
  function changesBetween(before, after, path = "", result = []) {
    if (JSON.stringify(before) === JSON.stringify(after)) return result;
    const a = before && typeof before === "object";
    const b = after && typeof after === "object";
    if (a && b && Array.isArray(before) === Array.isArray(after)) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
        changesBetween(before[key], after[key], path ? path + "." + key : key, result);
    } else {
      const password = path === "password" || path.endsWith(".password");
      result.push({ path,
        before: password ? passwordLabel(before) : redact(before),
        after: password ? passwordLabel(after) : redact(after),
      });
    }
    return result;
  }
  return Object.freeze({ changesBetween });
})();
