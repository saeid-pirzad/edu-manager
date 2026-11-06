// Static handler registry. No eval, Function constructor or HTML code execution.
const EduLegacyEvents = (() => {
  const handlers = new Map();
  const mutations = new Map();
  const register = (key, handler, { mutating } = {}) => {
    if (
      handlers.has(key) ||
      typeof handler !== "function" ||
      (mutating !== undefined && typeof mutating !== "boolean")
    )
      throw Error("Invalid legacy handler: " + key);
    handlers.set(key, handler);
    if (mutating !== undefined) mutations.set(key, mutating);
  };
  const report = (error) => {
    if (globalThis.EduV24?.course?.error) globalThis.EduV24.course.error(error);
    else console.error(error);
  };
  for (const type of [
    "click",
    "submit",
    "change",
    "input",
    "blur",
    "keydown",
    "toggle",
  ]) {
    const domEvent = type === "blur" ? "focusout" : type;
    for (const root of [
      document.getElementById("app"),
      document.getElementById("modalBody"),
      document.getElementById("calPopup"),
    ])
      root.addEventListener(
        domEvent,
        (event) => {
          for (const element of event.composedPath()) {
            if (!element.getAttribute) continue;
            const key = element.getAttribute("data-legacy-" + type);
            if (
              !key ||
              element.matches(":disabled") ||
              element.closest("[inert]")
            )
              continue;
            const handler = handlers.get(key);
            if (!handler) continue;
            try {
              const result = handler.call(element, event);
              if (result === false) {
                event.preventDefault();
                event.stopPropagation();
              } else if (result?.catch) result.catch(report);
            } catch (error) {
              report(error);
            }
            if (event.cancelBubble) break;
          }
        },
        type === "toggle",
      );
  }
  const mutates = (element, pattern) =>
    ["click", "submit", "change", "input", "blur", "keydown"].some((type) => {
      const key = element.getAttribute("data-legacy-" + type);
      if (!handlers.has(key)) return false;
      return mutations.has(key)
        ? mutations.get(key)
        : pattern.test(String(handlers.get(key)));
    });
  return Object.freeze({
    register,
    mutates,
    source: (key) => String(handlers.get(key) || ""),
  });
})();
