"use strict";
async function inspectListFirstLayout() {
  const results = [];
  const pause = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  const verify = async (kind, listSelector, formSelector) => {
    const list = document.querySelector(listSelector);
    const panel = document.querySelector(formSelector);
    for (const open of [false, true]) {
      panel.open = open;
      await pause();
      results.push({
        id: "LIST-FIRST-" + innerWidth + "-" + kind + "-" + open,
        name:
          kind +
          " list precedes its " +
          (open ? "expanded" : "collapsed") +
          " creation form visually and in keyboard order",
        pass:
          !!(
            list.compareDocumentPosition(panel) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ) &&
          list.getBoundingClientRect().bottom <=
            panel.getBoundingClientRect().top + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1,
      });
    }
    panel.open = false;
  };
  goSchools();
  await verify(
    "school",
    "#app > .dashboard-directory",
    "#app > .entity-quick-create",
  );
  goSchool(db.schools[0].id);
  await verify(
    "class",
    "#app > .dashboard-directory",
    "#app > .entity-quick-create",
  );
  goClass(db.schools[0].classes[0].id);
  await verify("lesson", "#app > .class-lessons", "#app > .lesson-create");
  setTab("students");
  await verify("student", "#app > .student-directory", "#app > .student-add");
  await verify(
    "csv-import",
    "#app > .student-directory",
    "#app > .student-import",
  );
  goSchools();
  return results;
}
module.exports = async function listFirstLayout({ cdp, evaluate, cases }) {
  for (const width of [
    320, 360, 390, 430, 600, 768, 820, 1024, 1280, 1440, 1920,
  ]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    cases.push(
      ...(await evaluate("(" + inspectListFirstLayout.toString() + ")()")),
    );
  }
};
