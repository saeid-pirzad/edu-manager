"use strict";

async function workflowChecks(width) {
  document.getElementById("pwaWelcomeLater")?.click();
  const cases = [],
    check = (id, name, pass, extra = {}) =>
      cases.push({ id: "W" + width + "-" + id, name, pass: !!pass, ...extra });
  closeModal();
  const pages = [
    ["schools", () => goSchools()],
    ["school", () => goSchool("school_a")],
    ["class", () => goClass("class_a")],
    ["lesson", () => goLesson("lesson_dual")],
    ["master", () => goMaster("class_a")],
    [
      "reports",
      () => {
        goReports();
        setReportTab("monthly");
      },
    ],
  ];
  for (const [name, open] of pages) {
    open();
    await new Promise((r) => setTimeout(r, 80));
    check(
      name,
      "viewport contains " + name,
      document.documentElement.scrollWidth <= innerWidth + 1,
      { viewport: innerWidth, content: document.documentElement.scrollWidth },
    );
    if (name === "schools")
      check(
        "quiet-home",
        "home has schools without duplicate dashboard panels",
        !!document.querySelector(".workflow-welcome") &&
          !document.querySelector(
            ".dashboard-report-links,.dashboard-work,.ui-hero",
          ),
      );
    if (name === "class")
      check(
        "lessons-first",
        "class opens on its lesson directory",
        state.tab === "lessons" && !!document.querySelector(".class-lessons"),
      );
    if (name === "lesson")
      check(
        "session-first",
        "lesson opens on sessions",
        state.tab === "sessions",
      );
    check(
      name + "-tools",
      "maintenance disclosure is collapsed",
      !document.querySelector(".workspace-tools")?.open &&
        !document.querySelector(".workspace-bar > button"),
    );
    if (name === "lesson") {
      document.querySelector(".session-open").click();
      await new Promise((r) => setTimeout(r, 50));
      check(
        "attendance-default",
        "session opens with attendance only",
        !!document.querySelector("[data-session-panel=activity]")?.hidden &&
          !document.querySelector("[data-session-panel=attendance]")?.hidden,
      );
      document.querySelector("[data-session-tab=activity]").click();
      check(
        "activity-tab",
        "native activity tab switches panels",
        document.querySelector("[data-session-panel=attendance]").hidden &&
          !document.querySelector("[data-session-panel=activity]").hidden,
      );
      check(
        "session-width",
        "session fits viewport",
        document.documentElement.scrollWidth <= innerWidth + 1,
      );
      closeModal();
    }
  }
  return cases;
}

module.exports = workflowChecks;
