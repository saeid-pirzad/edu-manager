// Static handler registry. No eval, Function constructor or HTML code execution.
const EduLegacyEvents = (() => {
  const handlers = new Map();
  const register = (key, handler) => {
    if (handlers.has(key) || typeof handler !== "function")
      throw Error("Invalid legacy handler: " + key);
    handlers.set(key, handler);
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
    ["click", "submit", "change", "input", "blur", "keydown"].some((type) =>
      pattern.test(
        String(handlers.get(element.getAttribute("data-legacy-" + type)) || ""),
      ),
    );
  return Object.freeze({
    register,
    mutates,
    source: (key) => String(handlers.get(key) || ""),
  });
})();
