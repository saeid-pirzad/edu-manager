"use strict";

// The shell exists before these scripts load. Bind only explicit elements and
// call the stable entry points at event time; no code is evaluated from markup.
(() => {
  const bindings = [
    ["modalClose", "click", () => closeModal()],
    ["importFile", "change", (event) => handleImport(event)],
    ["excelFile", "change", (event) => handleExcelImport(event)],
  ];
  for (const [id, eventName, handler] of bindings) {
    const element = document.getElementById(id);
    if (!element) throw Error("Missing application shell element: " + id);
    element.addEventListener(eventName, handler);
  }
})();
