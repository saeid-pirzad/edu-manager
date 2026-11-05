"use strict";

// School-create UI checks use the shared synthetic fixture and an isolated profile.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { main } = require("./data-integrity.cjs");

async function prepareSchools() {
  closeModal();
  document.getElementById("pwaWelcomeLater")?.click();
  goSchools();
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

function inspectSchoolCreate() {
  const form = document.querySelector('form[data-entity-create="school"]'),
    panel = form.closest("details"),
    summary = panel.querySelector(":scope > summary"),
    input = form.elements.namedItem("name"),
    submit = form.querySelector('button[type="submit"]'),
    error = form.querySelector(".entity-create-error"),
    list = document.querySelector(".dashboard-directory");
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return Object.fromEntries(
      ["left", "right", "top", "bottom", "width", "height"].map((key) => [
        key,
        rect[key],
      ]),
    );
  };
  const inputStyle = getComputedStyle(input),
    summaryStyle = getComputedStyle(summary),
    panelStyle = getComputedStyle(panel);
  return {
    width: innerWidth,
    coarse: matchMedia("(pointer:coarse)").matches,
    open: panel.open,
    schoolOnly: panel.classList.contains("school-create"),
    formKind: form.dataset.entityCreate,
    listBefore:
      !!(
        list.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING
      ) && box(list).bottom <= box(panel).top + 1,
    panel: box(panel),
    directory: box(list),
    form: box(form),
    summary: box(summary),
    input: box(input),
    field: box(input.closest("label")),
    submit: box(submit),
    inputFontSize: inputStyle.fontSize,
    summaryTabIndex: summary.tabIndex,
    summaryFocus: document.activeElement === summary,
    summaryOutline: summaryStyle.outlineWidth,
    summaryOutlineStyle: summaryStyle.outlineStyle,
    inputFocused: document.activeElement === input,
    inputValue: input.value,
    inputRequired: input.required,
    inputMaxLength: input.maxLength,
    enterKeyHint: input.enterKeyHint,
    summarySmallCount: summary.querySelectorAll("small").length,
    panelShadow: panelStyle.boxShadow,
    panelBorder: panelStyle.borderColor,
    surfaces: Object.fromEntries(
      Object.entries({ panel, summary, form }).map(([name, element]) => {
        const style = getComputedStyle(element);
        return [
          name,
          Object.fromEntries(
            [
              "borderWidth",
              "borderStyle",
              "borderColor",
              "borderRadius",
              "borderTopLeftRadius",
              "borderTopRightRadius",
              "borderBottomLeftRadius",
              "borderBottomRightRadius",
              "overflow",
              "backgroundColor",
              "backgroundImage",
              "boxShadow",
            ].map((property) => [property, style[property]]),
          ),
        ];
      }),
    ),
    labelled: !!input.labels?.length && !!input.labels[0].textContent.trim(),
    submitCount: form.querySelectorAll(
      'button[type="submit"],input[type="submit"]',
    ).length,
    errorRole: error.getAttribute("role"),
    errorLinked: input
      .getAttribute("aria-describedby")
      ?.split(/\s+/)
      .includes(error.id),
    invalid: input.getAttribute("aria-invalid"),
    errorText: error.textContent.trim(),
    noOverflow:
      document.documentElement.scrollWidth <= innerWidth + 1 &&
      panel.scrollWidth <= panel.clientWidth + 1 &&
      (!panel.open || form.scrollWidth <= form.clientWidth + 1),
    controlClipping:
      submit.scrollWidth > submit.clientWidth + 1 ||
      summary.scrollWidth > summary.clientWidth + 1,
  };
}

async function readSchoolStore() {
  await EduV24.test.settle();
  const stores = {};
  for (const name of ["records", "catalog", "events", "undo"]) {
    const request = EduV24.test
      .getConnection()
      .transaction(name)
      .objectStore(name)
      .getAll();
    stores[name] = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  const context = EduV24.getReportContext();
  return {
    workspace: context.id,
    revision: context.revision,
    schools: db.schools,
    stores,
    meta: stores.records.find(
      (row) => row.workspace === context.id && row.logical === "meta",
    ),
    nonSchoolRecords: stores.records.filter((row) =>
      /^(class|session):/.test(row.logical),
    ),
  };
}

async function captureBaseline({ cdp, evaluate, cases, delay }) {
  const directory = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      process.argv.includes("--diagnostics")
        ? "edu-school-diagnostics-"
        : "edu-school-before-",
    ),
  );
  console.log("School create audit artifacts: " + directory);
  const observations = [];
  for (const width of [390, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate("(" + prepareSchools.toString() + ")()");
    for (const open of [false, true]) {
      if (open)
        await evaluate(
          "document.querySelector('form[data-entity-create=school]').closest('details').querySelector('summary').click()",
        );
      await evaluate(
        "document.querySelector('form[data-entity-create=school]').closest('details').scrollIntoView({block:'center',behavior:'instant'})",
      );
      await delay(100);
      const result = await evaluate(
        "(" + inspectSchoolCreate.toString() + ")()",
      );
      result.markup = await evaluate(
        "document.querySelector('form[data-entity-create=school]').closest('details').outerHTML",
      );
      observations.push(result);
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(directory, `school-${width}-${open ? "open" : "closed"}.png`),
        Buffer.from(shot.data, "base64"),
      );
    }
  }
  fs.writeFileSync(
    path.join(directory, "school-observations.json"),
    JSON.stringify(observations, null, 2) + "\n",
  );
  cases.push({
    id: "SCHOOL_CREATE_BASELINE",
    name: "School create closed and expanded previews are captured in mobile and desktop views",
    pass: observations.length === 4,
    observed: { directory, screenshots: observations.length },
  });
}

async function run({ cdp, evaluate, cases, delay }) {
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  if (
    process.argv.includes("--baseline") ||
    process.argv.includes("--diagnostics")
  )
    return captureBaseline({ cdp, evaluate, cases, delay });
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "edu-school-create-"),
    ),
    observations = [];
  console.log("School create audit artifacts: " + directory);
  const add = (id, name, pass, observed) =>
    cases.push({ id: "SCHOOL_CREATE_" + id, name, pass: !!pass, observed });
  const checkFrame = (id, result) => {
    const { panel, summary, form } = result.surfaces;
    add(
      "FRAME_" + id,
      "School card backgrounds respect the rounded frame without clipping focus at " +
        id,
      panel.borderRadius === "16px" &&
        panel.borderWidth === "1px" &&
        panel.borderStyle === "solid" &&
        panel.overflow === "visible" &&
        summary.borderTopLeftRadius === "15px" &&
        summary.borderTopRightRadius === "15px" &&
        summary.borderBottomLeftRadius === (result.open ? "0px" : "15px") &&
        summary.borderBottomRightRadius === (result.open ? "0px" : "15px") &&
        form.borderBottomLeftRadius === "15px" &&
        form.borderBottomRightRadius === "15px",
      { open: result.open, panel, summary, form },
    );
  };
  const call = (method) => evaluate("(" + method.toString() + ")()");
  const inspect = () => call(inspectSchoolCreate);
  const pause = () => delay(100);
  const key = async (key, code, windowsVirtualKeyCode) => {
    for (const type of ["keyDown", "keyUp"])
      await cdp("Input.dispatchKeyEvent", {
        type,
        key,
        code,
        windowsVirtualKeyCode,
        // A physical Enter also emits its character/keypress activation.
        ...(type === "keyDown" && key === "Enter"
          ? { text: "\r", unmodifiedText: "\r" }
          : {}),
      });
    await pause();
  };
  const click = async (selector) => {
    const point = await evaluate(`(()=>{
      const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center',behavior:'instant'});
      const r=el.getBoundingClientRect();return {x:(r.left+r.right)/2,y:(r.top+r.bottom)/2};
    })()`);
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await cdp("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await pause();
  };
  const summary = ".school-create > summary",
    input = "#schoolCreateName",
    submit = '.school-create button[type="submit"]';
  const saveShot = async (name) => {
    await evaluate(
      "document.querySelector('.school-create').scrollIntoView({block:'center',behavior:'instant'})",
    );
    await pause();
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(directory, name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  };
  const accessibility = async () => {
    const { root } = await cdp("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: summary,
    });
    const { nodes } = await cdp("Accessibility.getPartialAXTree", { nodeId });
    const node = nodes.find(
      (value) =>
        value.backendDOMNodeId &&
        value.properties?.some((property) => property.name === "expanded"),
    );
    return {
      name: node?.name?.value,
      expanded: node?.properties.find(
        (property) => property.name === "expanded",
      )?.value?.value,
      focusable: node?.properties.find(
        (property) => property.name === "focusable",
      )?.value?.value,
    };
  };
  const scenarios = [
    ...[320, 390, 600, 639, 640, 700, 701, 768, 834, 1024, 1280].map(
      (width) => ({
        width,
        height: 1000,
        touch: false,
      }),
    ),
    { width: 768, height: 1024, touch: true },
    { width: 1024, height: 768, touch: true },
  ];
  for (const scenario of scenarios) {
    const { width, height, touch } = scenario,
      suffix = width + (touch ? "_coarse" : "_fine");
    await cdp("Emulation.setTouchEmulationEnabled", {
      enabled: touch,
      maxTouchPoints: touch ? 5 : 1,
    });
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: touch,
    });
    await call(prepareSchools);
    const closed = await inspect();
    checkFrame(suffix + "_closed", closed);
    add(
      "CLOSED_" + suffix,
      "Populated school create starts closed after its directory at " + suffix,
      !closed.open &&
        closed.schoolOnly &&
        closed.formKind === "school" &&
        closed.listBefore &&
        closed.coarse === touch,
      closed,
    );
    await saveShot("school-" + suffix + "-closed");
    const axClosed = await accessibility();
    await click(summary);
    const expanded = await inspect(),
      axOpen = await accessibility();
    checkFrame(suffix + "_open", expanded);
    add(
      "DISCLOSURE_" + suffix,
      "A real pointer click opens an accessible labelled school disclosure at " +
        suffix,
      expanded.open &&
        axClosed.expanded === false &&
        axOpen.expanded === true &&
        axOpen.focusable === true &&
        !!axOpen.name?.trim(),
      { axClosed, axOpen, open: expanded.open },
    );
    add(
      "FIELDS_" + suffix,
      "School create keeps one labelled required name, one submit and its linked alert at " +
        suffix,
      expanded.labelled &&
        expanded.inputRequired &&
        expanded.inputMaxLength === 500 &&
        expanded.enterKeyHint === "done" &&
        expanded.submitCount === 1 &&
        expanded.errorRole === "alert" &&
        expanded.errorLinked,
      expanded,
    );
    add(
      "LAYOUT_" + suffix,
      "The school-only card matches the directory width with a simple 64px heading and responsive 48px form controls at " +
        suffix,
      Math.abs(expanded.panel.left - expanded.directory.left) <= 1 &&
        Math.abs(expanded.panel.right - expanded.directory.right) <= 1 &&
        expanded.summary.height >= 63.5 &&
        expanded.summarySmallCount === 0 &&
        expanded.panelShadow === "none" &&
        expanded.panelBorder === "rgb(228, 228, 231)" &&
        expanded.input.height >= 47.5 &&
        expanded.submit.height >= 47.5 &&
        parseFloat(expanded.inputFontSize) >= 16 &&
        expanded.field.width <= expanded.form.width &&
        (width < 640
          ? expanded.submit.top >= expanded.input.bottom + 8 &&
            Math.abs(expanded.input.width - expanded.submit.width) <= 1
          : Math.abs(expanded.input.bottom - expanded.submit.bottom) <= 1 &&
            Math.abs(expanded.submit.width - 144) <= 0.5),
      expanded,
    );
    const nonOverlap = (first, second) =>
      Math.min(first.right, second.right) - Math.max(first.left, second.left) <=
        1 ||
      Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) <=
        1;
    add(
      "FIT_" + suffix,
      "School controls fit without clipping or overlap and preserve 44px touch targets at " +
        suffix,
      expanded.noOverflow &&
        !expanded.controlClipping &&
        [expanded.summary, expanded.input, expanded.submit].every(
          (rect) =>
            rect.width >= 43.5 &&
            rect.height >= 43.5 &&
            rect.left >= -1 &&
            rect.right <= width + 1,
        ) &&
        nonOverlap(expanded.input, expanded.submit) &&
        (width > 700 || parseFloat(expanded.inputFontSize) >= 16),
      expanded,
    );
    observations.push({ scenario, phase: "open", ...expanded });
    await saveShot("school-" + suffix + "-open");
    await evaluate(`document.querySelector(${JSON.stringify(input)}).focus()`);
    await cdp("Input.insertText", { text: "مدرسه حفظ نام" });
    await click(summary);
    const afterClose = await inspect();
    await key("Enter", "Enter", 13);
    const afterEnter = await inspect();
    await key(" ", "Space", 32);
    const afterSpace = await inspect();
    add(
      "KEYBOARD_" + suffix,
      "Enter and Space toggle the school form without losing its typed name or focus at " +
        suffix,
      !afterClose.open &&
        afterClose.summaryFocus &&
        afterEnter.open &&
        afterEnter.summaryFocus &&
        !afterSpace.open &&
        afterSpace.summaryFocus &&
        afterSpace.summaryTabIndex >= 0 &&
        parseFloat(afterSpace.summaryOutline) >= 2 &&
        afterSpace.summaryOutlineStyle !== "none" &&
        [afterClose, afterEnter, afterSpace].every(
          (row) => row.inputValue === "مدرسه حفظ نام",
        ),
      Object.fromEntries(
        Object.entries({ afterClose, afterEnter, afterSpace }).map(
          ([phase, row]) => [
            phase,
            {
              open: row.open,
              focused: row.summaryFocus,
              value: row.inputValue,
              tabIndex: row.summaryTabIndex,
              outlineWidth: row.summaryOutline,
              outlineStyle: row.summaryOutlineStyle,
            },
          ],
        ),
      ),
    );
  }
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const emptyBackup = await evaluate("EduV24.snapshotInstallation()");
  try {
    await evaluate(`(async()=>{
      const settings=structuredClone(db.settings);db=defaultDB();db.settings=settings;
      await saveDB({action:'Synthetic empty-school UI fixture'});goSchools();
    })()`);
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    await call(prepareSchools);
    const empty = await inspect();
    add(
      "EMPTY",
      "The first-school form opens automatically but still follows the empty directory",
      empty.open &&
        empty.schoolOnly &&
        empty.listBefore &&
        (await evaluate("db.schools.length===0")),
      empty,
    );
    await saveShot("school-390-empty");
  } finally {
    await evaluate(`(async()=>{
      EduV24.previewFullBackup(${JSON.stringify(emptyBackup)});
      document.getElementById('fullRestoreConfirmed').checked=true;
      await EduV24.restoreFullBackup();closeModal();goSchools();
    })()`);
  }
  const before = await call(readSchoolStore);
  add(
    "WRITABLE",
    "School creation is exercised against a real writable isolated IndexedDB workspace",
    await evaluate(
      "(()=>{const x=EduV24.getReportContext();return x.ready&&!x.blocked&&!x.closed&&!x.retired&&x.authenticated})()",
    ),
    { workspace: before.workspace, revision: before.revision },
  );
  const typeName = async (name) => {
    if (!(await inspect()).open) await click(summary);
    await evaluate(
      `(()=>{const input=document.querySelector(${JSON.stringify(input)});input.focus();input.select()})()`,
    );
    await cdp("Input.insertText", { text: name });
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(25);
    }
    throw Error("School-create transaction did not settle: " + expression);
  };
  const hash = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  await typeName("   ");
  await click(submit);
  await waitFor(
    "!!document.getElementById('schoolCreateError').textContent.trim()&&!document.querySelector('.school-create form').hasAttribute('aria-busy')",
  );
  const invalid = await inspect(),
    afterInvalid = await call(readSchoolStore);
  add(
    "INVALID",
    "Whitespace-only school names are rejected inline, linked to the alert and focused without writing data",
    invalid.open &&
      invalid.errorText &&
      invalid.errorRole === "alert" &&
      invalid.errorLinked &&
      invalid.invalid === "true" &&
      invalid.inputFocused &&
      hash(before.stores) === hash(afterInvalid.stores),
    { invalid, before: hash(before.stores), after: hash(afterInvalid.stores) },
  );
  await typeName("  مدرسه   یکتای کیان  ");
  await click(submit);
  await waitFor(
    "db.schools.some(x=>x.name==='مدرسه یکتای کیان')&&!document.querySelector('.school-create form').hasAttribute('aria-busy')",
  );
  const created = await call(readSchoolStore),
    savedSchool = created.schools.find(
      (school) => school.name === "مدرسه یکتای کیان",
    );
  add(
    "SAVE",
    "A real form submission normalizes and atomically stores one new school in IndexedDB",
    created.schools.length === before.schools.length + 1 &&
      !!savedSchool?.id &&
      savedSchool.classes.length === 0 &&
      created.meta?.value.layout.some(
        (school) =>
          school.id === savedSchool.id && school.name === savedSchool.name,
      ) &&
      created.revision > before.revision &&
      !(await inspect()).open,
    {
      countBefore: before.schools.length,
      countAfter: created.schools.length,
      savedSchool,
      revisionBefore: before.revision,
      revisionAfter: created.revision,
      durableLayout: created.meta?.value.layout,
    },
  );
  for (const [id, name] of [
    ["EXACT", "مدرسه یکتای کیان"],
    ["NORMALIZED", "  مدرسه  يكتاي كيان  "],
  ]) {
    const beforeDuplicate = await call(readSchoolStore);
    await typeName(name);
    await click(submit);
    await waitFor(
      "!!document.getElementById('schoolCreateError').textContent.trim()&&!document.querySelector('.school-create form').hasAttribute('aria-busy')",
    );
    const duplicate = await inspect(),
      afterDuplicate = await call(readSchoolStore);
    add(
      "DUPLICATE_" + id,
      "The existing exact/normalized duplicate-school rule rejects without adding or overwriting data: " +
        id,
      duplicate.open &&
        duplicate.errorText.includes("همین نام") &&
        duplicate.invalid === "true" &&
        duplicate.inputFocused &&
        duplicate.inputValue === name.trim().replace(/\s+/g, " ") &&
        afterDuplicate.schools.length === created.schools.length &&
        hash(beforeDuplicate.stores) === hash(afterDuplicate.stores),
      {
        duplicate,
        before: hash(beforeDuplicate.stores),
        after: hash(afterDuplicate.stores),
      },
    );
  }
  const preserved = await call(readSchoolStore);
  add(
    "ISOLATION",
    "Creating a school cannot change existing classes, students, lesson grades or session records",
    hash(preserved.nonSchoolRecords) === hash(before.nonSchoolRecords) &&
      before.schools.every(
        (school) =>
          hash(school) ===
          hash(preserved.schools.find((row) => row.id === school.id)),
      ),
    {
      before: hash(before.nonSchoolRecords),
      after: hash(preserved.nonSchoolRecords),
    },
  );
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const reloaded = await call(readSchoolStore);
  add(
    "RELOAD",
    "The newly created school survives a fresh document with all other school data intact",
    reloaded.schools.length === created.schools.length &&
      reloaded.schools.some(
        (school) =>
          school.id === savedSchool.id && school.name === savedSchool.name,
      ) &&
      hash(reloaded.nonSchoolRecords) === hash(before.nonSchoolRecords),
    {
      expectedId: savedSchool?.id,
      count: reloaded.schools.length,
      nonSchoolRecords: hash(reloaded.nonSchoolRecords),
    },
  );
  const otherForms = await evaluate(`(()=>{
    const school=db.schools.find(s=>s.classes.length),classroom=school.classes.find(c=>c.lessons.length&&c.students.length);
    goSchool(school.id);const classPanel=document.querySelector('form[data-entity-create=class]').closest('details');
    const classOnly=!classPanel.matches('.school-create')&&classPanel.querySelectorAll('button[type=submit]').length===1;
    goClass(classroom.id);setTab('students');const studentPanel=document.querySelector('.student-add');
    const studentOnly=!studentPanel.matches('.school-create')&&studentPanel.querySelectorAll('input').length===2;
    setTab('lessons');const lessonPanel=document.querySelector('.lesson-create');
    return {classOnly,studentOnly,lessonOnly:!lessonPanel.matches('.school-create')&&!!lessonPanel.querySelector('#courseEditor')};
  })()`);
  add(
    "OTHER_FORMS",
    "The school-only component modifier never leaks into class, student or lesson creation",
    Object.values(otherForms).every(Boolean),
    otherForms,
  );
  fs.writeFileSync(
    path.join(directory, "school-observations.json"),
    JSON.stringify(observations, null, 2) + "\n",
  );
  const screenshots = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".png")).length;
  add(
    "ARTIFACTS",
    "All requested pointer/viewport school previews and the first-school state are captured",
    screenshots === scenarios.length * 2 + 1,
    { directory, screenshots },
  );
}

module.exports = { run };
if (require.main === module)
  main({ stage: "school-create-ui", runExtra: run }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
