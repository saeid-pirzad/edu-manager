// Local, dependency-free line icons. Names select trusted paths, never user markup.
(function () {
  "use strict";
  const paths = Object.freeze({
    add: "M12 5v14M5 12h14",
    school: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 10h1M15 10h1",
    classroom: "M3 4h18v13H3zM8 21h8M12 17v4M7 8h10M7 12h6",
    book: "M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15",
    users:
      "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M5 21v-3a7 7 0 0 1 14 0v3M18 4a3 3 0 0 1 0 6M21 20v-3a5 5 0 0 0-2-4",
    report: "M4 3v18h17M8 17v-5M13 17V8M18 17V5",
    calendar: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2",
    save: "M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8",
    download: "M12 3v12M7 10l5 5 5-5M4 16v5h16v-5",
    upload: "M12 16V3M7 8l5-5 5 5M4 16v5h16v-5",
    shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3ZM8 12l3 3 5-6",
    folder: "M3 6h7l2 2h9v12H3V6ZM3 6V4h7l2 2",
    clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2",
    undo: "M8 4 3 9l5 5M3 9h11a7 7 0 0 1 7 7v4",
    edit: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z",
    trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
    close: "M6 6l12 12M18 6 6 18",
    check: "m5 12 4 4L19 6",
    print: "M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7v-7ZM17 11h1",
    settings:
      "M9 3h6l1 4 4 2v6l-4 2-1 4H9l-1-4-4-2V9l4-2 1-4ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    arrow: "M20 12H4m6-6-6 6 6 6",
    grades: "M6 3h12v18H6V3ZM9 7h6M9 11h6M9 15h2m2 2 2 2 4-4",
    attendance: "M9 4h6v4H9V4ZM9 6H5v15h14V6h-4M8 14l3 3 5-6",
    more: "M6 11v2M12 11v2M18 11v2",
    disconnect: "M10 4v5M14 4v5M7 9h10v3a5 5 0 0 1-10 0V9ZM12 17v4",
  });
  globalThis.EduIcons = Object.freeze({
    names: Object.freeze(Object.keys(paths)),
    html(name) {
      if (!Object.hasOwn(paths, name)) return "";
      return (
        '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' +
        paths[name] +
        '"/></svg>'
      );
    },
  });
})();
