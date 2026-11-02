"use strict";

async function calendarAndStudent({ ids, expected }) {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    wait = async (predicate) => {
      for (let i = 0; i < 180; i++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Deputy Jalali/student flow timed out: " + EduDeputyUI.status().message,
      );
    },
    change = (id, value) => {
      const input = document.getElementById(id);
      if (!input) throw Error("Deputy control is missing: " + id);
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    setDate = async (id, value) => {
      change(id, value);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    },
    report = () => document.getElementById("deputyPrintable"),
    calendar = () => document.getElementById("calPopup"),
    calendarOpen = async (field) => {
      document
        .getElementById(
          "deputy" + (field === "from" ? "From" : "To") + "-shamsi",
        )
        .click();
      await wait(() => calendar()?.classList.contains("open"));
    };
  [...document.querySelectorAll('[data-deputy-tab="reports"]')]
    .find((node) => node.getClientRects().length)
    .click();
  change("deputySource", expected.keyB);
  change("deputyTerm", "all");
  change("deputyClass", "");
  check(
    "DEPUTY_STUDENT_CLASS_FIRST",
    "student filtering requires an explicit class and does not guess between identical names",
    document.getElementById("deputyStudent").disabled &&
      document.getElementById("deputyStudent").value === "",
  );
  await setDate("deputyFrom", "2026-11-01");
  await setDate("deputyTo", "2026-11-01");
  check(
    "DEPUTY_SHARED_NATIVE_RANGE",
    "hidden native ISO boundaries and the shared readonly Jalali proxies select the actual matching session",
    document.getElementById("deputyFrom").type === "date" &&
      !document.getElementById("deputyFrom").getClientRects().length &&
      document.getElementById("deputyFrom-shamsi").readOnly &&
      document.getElementById("deputyFrom-shamsi").value === "۱۴۰۵/۰۸/۱۰" &&
      document.querySelectorAll(".ed-session").length === 1 &&
      document.querySelector(".ed-session").textContent.includes("زنگ ۱"),
  );
  await setDate("deputyFrom", "2026-02-30");
  check(
    "DEPUTY_SHARED_NATIVE_INVALID",
    "the native date control rejects an impossible ISO date as empty and never reuses a stale valid boundary",
    document.getElementById("deputyFrom").value === "" &&
      document.getElementById("deputyFrom-shamsi").value === "" &&
      !document.getElementById("deputyFrom-shamsi").dataset.jy,
  );
  for (const [suffix, value] of [
    ["month", "2026-13-01"],
    ["day", "2026-02-30"],
  ]) {
    // Defense-in-depth only: users cannot type into the readonly proxy and a
    // native date input itself already coerces impossible dates to empty.
    const native = document.getElementById("deputyFrom");
    native.type = "text";
    native.value = value;
    native.dispatchEvent(new Event("change", { bubbles: true }));
    native.type = "date";
    check(
      "DEPUTY_SHARED_ISO_DEFENSE_" + suffix,
      "a tampered synthetic ISO " +
        suffix +
        " is rejected at the adapter boundary instead of silently restoring a previous report",
      document
        .getElementById("deputyFrom-shamsi")
        .getAttribute("aria-invalid") === "true" &&
        document.querySelector('[data-deputy-action="print"]').disabled &&
        !report(),
    );
  }
  await setDate("deputyTo", "");
  await setDate("deputyFrom", "2027-03-20");
  await calendarOpen("from");
  check(
    "DEPUTY_SHARED_NONLEAP",
    "the actual shared calendar does not offer Esfand day 30 in non-leap year 1405",
    calendar().querySelector(".cal-title").textContent.includes("۱۴۰۵") &&
      !!calendar().querySelector('[data-calendar-day="29"]') &&
      !calendar().querySelector('[data-calendar-day="30"]'),
    { title: calendar().querySelector(".cal-title").textContent },
  );
  calendar().querySelector('[data-calendar-action="close"]').click();
  await setDate("deputyFrom", "2025-03-20");
  await setDate("deputyTo", "2025-03-20");
  await calendarOpen("from");
  check(
    "DEPUTY_JALALI_LEAP",
    "the shared teacher calendar offers leap-year Esfand day 30 and applies it even with no matching sessions",
    !!calendar().querySelector('[data-calendar-day="30"].selected') &&
      !!report() &&
      !document.querySelector('[data-deputy-action="print"]').disabled &&
      document.querySelectorAll(".ed-session").length === 0,
  );
  calendar().querySelector('[data-calendar-action="close"]').click();
  await setDate("deputyFrom", "2026-11-02");
  await setDate("deputyTo", "2026-11-01");
  let prints = 0;
  const oldPrint = window.print;
  window.print = () => prints++;
  document.querySelector('[data-deputy-action="print"]').click();
  window.print = oldPrint;
  check(
    "DEPUTY_JALALI_RANGE",
    "a reversed valid ISO date range suppresses the report and cannot invoke PDF printing",
    document.querySelector('[data-deputy-action="print"]').disabled &&
      !report() &&
      prints === 0,
  );
  document
    .querySelector('[data-deputy-action="calendar-clear"][data-field="from"]')
    .click();
  check(
    "DEPUTY_JALALI_CLEAR",
    "the external per-field clear action resets both ISO and shared proxy date caches without altering the teacher popup",
    document.getElementById("deputyFrom").value === "" &&
      document.getElementById("deputyFrom-shamsi").value === "" &&
      !document.getElementById("deputyFrom-shamsi").dataset.jy &&
      !document.querySelector('[data-deputy-action="print"]').disabled &&
      document.querySelectorAll(".ed-session").length === 1,
  );
  await setDate("deputyFrom", "2026-11-01");
  await calendarOpen("from");
  const initialMonth = calendar().querySelector(".cal-title").textContent;
  calendar().querySelector('[data-calendar-action="prev"]').click();
  const previousMonth = calendar().querySelector(".cal-title").textContent;
  calendar().querySelector('[data-calendar-action="next"]').click();
  check(
    "DEPUTY_JALALI_MONTH",
    "shared teacher month navigation stays open and returns to the selected Jalali month",
    previousMonth !== initialMonth &&
      calendar().classList.contains("open") &&
      calendar().querySelector(".cal-title").textContent === initialMonth,
  );
  const chosenDay = calendar().querySelector(
    '[data-calendar-action="select"][data-calendar-day="11"]',
  );
  if (!chosenDay)
    throw Error("Jalali month did not contain its expected ISO day");
  chosenDay.click();
  await wait(
    () =>
      !calendar()?.classList.contains("open") &&
      document.activeElement.id === "deputyFrom-shamsi",
  );
  check(
    "DEPUTY_JALALI_PICKER",
    "selecting a shared calendar day synchronizes ISO and canonical Jalali values then restores proxy focus",
    document.getElementById("deputyFrom").value === "2026-11-02" &&
      document.getElementById("deputyFrom-shamsi").value === "۱۴۰۵/۰۸/۱۱" &&
      document.activeElement.id === "deputyFrom-shamsi",
    {
      value: document.getElementById("deputyFrom").value,
      proxy: document.getElementById("deputyFrom-shamsi").value,
    },
  );
  await calendarOpen("from");
  document.activeElement.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await wait(
    () =>
      !calendar()?.classList.contains("open") &&
      document.activeElement?.id === "deputyFrom-shamsi",
  );
  check(
    "DEPUTY_JALALI_ESCAPE",
    "Escape closes the shared calendar and restores keyboard focus to its original readonly proxy",
    document.activeElement.id === "deputyFrom-shamsi",
  );
  await setDate("deputyFrom", "");
  await setDate("deputyTo", "");
  change("deputyClass", ids.classroom);
  const options = [...document.getElementById("deputyStudent").options];
  check(
    "DEPUTY_STUDENT_IDENTITIES",
    "same-name students remain distinct options by stable identity and archived pupils remain selectable",
    options.some(
      (item) => item.value === ids.a && item.textContent.includes("100"),
    ) &&
      options.some(
        (item) => item.value === ids.b && item.textContent.includes("200"),
      ) &&
      options.some((item) => item.value === ids.archived),
  );
  change("deputyStudent", ids.a);
  const selectedReport = report(),
    participants = [...selectedReport.querySelectorAll(".ed-participant")];
  check(
    "DEPUTY_STUDENT_SCOPE",
    "a selected student alone appears in attendance, activity and all official course cards despite a same-name peer",
    participants.length === 2 &&
      participants.every(
        (item) =>
          item.textContent.includes("100") && !item.textContent.includes("200"),
      ) &&
      selectedReport.querySelectorAll(".ed-grade").length === 3 &&
      !selectedReport.textContent.includes("هنرجوی بایگانی آزمایشی") &&
      !!selectedReport.querySelector(".ed-selected-student"),
    {
      participants: participants.length,
      gradeCards: selectedReport.querySelectorAll(".ed-grade").length,
    },
  );
  change("deputyStudent", ids.b);
  check(
    "DEPUTY_STUDENT_SAME_NAME",
    "changing between identical student names changes attendance by ID rather than combining the two pupils",
    [...report().querySelectorAll(".ed-participant")].every(
      (item) =>
        item.textContent.includes("200") && !item.textContent.includes("100"),
    ) && !report().textContent.includes("فعالیت با نمرهٔ صفر"),
  );
  change("deputyStudent", ids.archived);
  check(
    "DEPUTY_STUDENT_ARCHIVED",
    "the archived pupil's historical session remains reportable without inventing later session membership",
    report().querySelectorAll(".ed-participant").length === 1 &&
      report().querySelector(".ed-participant").textContent.includes("300") &&
      report().querySelectorAll(".ed-session").length === 1 &&
      report().textContent.includes("هنرجوی بایگانی آزمایشی"),
  );
  change("deputyTerm", "second");
  check(
    "DEPUTY_STUDENT_EMPTY_TERM",
    "an archived student's missing attendance in the second term stays empty instead of broadening to all classmates",
    document.getElementById("deputyStudent").value === ids.archived &&
      report().querySelectorAll(".ed-session").length === 0 &&
      report().querySelectorAll(".ed-participant").length === 0 &&
      report().textContent.includes("300"),
  );
  change("deputyTerm", "all");
  change("deputyClass", ids.secondClass);
  check(
    "DEPUTY_STUDENT_CLASS_RESET",
    "changing class clears the previous student's filter instead of applying it to another class",
    document.getElementById("deputyStudent").value === "" &&
      !report().querySelector(".ed-selected-student"),
  );
  change("deputyClass", ids.classroom);
  change("deputyStudent", ids.a);
  change("deputyTerm", "first");
  check(
    "DEPUTY_STUDENT_TERM",
    "term changes preserve an available pupil but do not leak another term's attendance",
    document.getElementById("deputyStudent").value === ids.a &&
      report().querySelectorAll(".ed-session").length === 1 &&
      report().querySelectorAll(".ed-participant").length === 1,
  );
  change("deputySource", expected.keyA);
  check(
    "DEPUTY_STUDENT_SOURCE_RESET",
    "changing sender clears the previous student's identity and class scope",
    document.getElementById("deputyStudent").value === "" &&
      !report().querySelector(".ed-selected-student"),
  );
  change("deputySource", expected.keyB);
  change("deputyClass", ids.classroom);
  change("deputyTerm", "all");
  change("deputyStudent", ids.a);
  return cases;
}

module.exports = async function run({
  cdp,
  evaluate,
  cases,
  ids,
  expected,
  artifacts,
  teacherCalendar,
  calendarSnapshot,
}) {
  const fs = require("node:fs"),
    path = require("node:path"),
    key = async (name, number, modifiers = 0) => {
      for (const type of ["keyDown", "keyUp"])
        await cdp("Input.dispatchKeyEvent", {
          type,
          key: name,
          code: name === " " ? "Space" : name,
          windowsVirtualKeyCode: number,
          nativeVirtualKeyCode: number,
          modifiers,
        });
    },
    settled = () =>
      evaluate(
        "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
      );
  // The user explicitly replaced manual typing with the actual teacher's
  // readonly picker proxy. These assertions test that changed capability honestly.
  await evaluate(
    "[...document.querySelectorAll('[data-deputy-tab=reports]')].find(node=>node.getClientRects().length).click();document.getElementById('deputyFrom').value='2026-11-01';document.getElementById('deputyFrom').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('deputyFrom-shamsi').focus()",
  );
  for (const [label, text] of [
    ["PERSIAN", "۱۴۰۵۰۸۱۱"],
    ["LATIN", "1405/8/11"],
    ["ARABIC", "١٤٠٥٠٨١١"],
  ]) {
    await evaluate(
      "document.getElementById('deputyFrom-shamsi').focus();document.getElementById('deputyFrom-shamsi').select()",
    );
    await cdp("Input.insertText", { text });
    const actual = await evaluate(
      "(()=>{const native=document.getElementById('deputyFrom'),proxy=document.getElementById('deputyFrom-shamsi');return{type:native.type,iso:native.value,readonly:proxy.readOnly,value:proxy.value,controls:proxy.getAttribute('aria-controls'),ownClone:!!document.getElementById('deputyDateDialog')}})()",
    );
    cases.push({
      id: "DEPUTY_SHARED_READONLY_" + label,
      name:
        "actual " +
        label +
        " text insertion cannot alter the shared teacher's readonly date proxy or its ISO boundary",
      pass:
        actual.type === "date" &&
        actual.iso === "2026-11-01" &&
        actual.readonly &&
        actual.value === "۱۴۰۵/۰۸/۱۰" &&
        actual.controls === "calPopup" &&
        !actual.ownClone,
      observed: actual,
    });
  }
  await key("Tab", 9);
  const tabbed = await evaluate(
    "(()=>{const node=document.activeElement;return{id:node?.id,action:node?.dataset.deputyAction,field:node?.dataset.field,visible:!!node?.getClientRects().length}})()",
  );
  cases.push({
    id: "DEPUTY_SHARED_NATIVE_TAB",
    name: "real Tab leaves the readonly proxy for its visible per-field clear action rather than trapping focus or focusing hidden ISO input",
    pass:
      tabbed.visible &&
      tabbed.action === "calendar-clear" &&
      tabbed.field === "from",
    observed: tabbed,
  });
  for (const [name, number] of [
    ["Enter", 13],
    [" ", 32],
    ["ArrowDown", 40],
  ]) {
    await evaluate("document.getElementById('deputyFrom-shamsi').focus()");
    await key(name, number);
    const opened = await evaluate(
      "(()=>{const popup=document.getElementById('calPopup');return{open:popup.classList.contains('open'),focusInside:popup.contains(document.activeElement),expanded:document.getElementById('deputyFrom-shamsi').getAttribute('aria-expanded')}})()",
    );
    cases.push({
      id: "DEPUTY_SHARED_KEY_" + (name === " " ? "SPACE" : name.toUpperCase()),
      name:
        "the real " +
        (name === " " ? "Space" : name) +
        " key opens the actual teacher popup with focus inside",
      pass: opened.open && opened.focusInside && opened.expanded === "true",
      observed: opened,
    });
    await key("Escape", 27);
    await settled();
    const escaped = await evaluate(
      "({closed:!document.getElementById('calPopup').classList.contains('open'),focus:document.activeElement?.id})",
    );
    cases.push({
      id:
        "DEPUTY_SHARED_ESCAPE_" + (name === " " ? "SPACE" : name.toUpperCase()),
      name: "real Escape dismisses the shared calendar and returns focus to its readonly proxy",
      pass: escaped.closed && escaped.focus === "deputyFrom-shamsi",
      observed: escaped,
    });
  }
  const calendarButton = await evaluate(
    "(()=>{const button=document.getElementById('deputyFrom-shamsi');button.scrollIntoView({block:'center',behavior:'instant'});const r=button.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()",
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await cdp("Input.dispatchMouseEvent", {
      type,
      ...calendarButton,
      button: "left",
      clickCount: 1,
    });
  const pointerBlur = await evaluate(
    "(()=>{const dialog=document.getElementById('calPopup');return{opened:dialog.classList.contains('open'),value:document.getElementById('deputyFrom').value,focusInside:dialog.contains(document.activeElement)}})()",
  );
  cases.push({
    id: "DEPUTY_SHARED_FIRST_POINTER",
    name: "the first real pointer click on the readonly teacher proxy opens the shared calendar and focuses a day",
    pass: pointerBlur.opened && pointerBlur.focusInside,
    observed: pointerBlur,
  });
  if (pointerBlur.opened) {
    await evaluate("document.fonts.ready");
    const actual = await evaluate("(" + calendarSnapshot + ")()");
    const styleDifferences = Object.keys(teacherCalendar.styles).filter(
      (name) =>
        JSON.stringify(actual.styles[name]) !==
        JSON.stringify(teacherCalendar.styles[name]),
    );
    cases.push({
      id: "DEPUTY_SHARED_TEACHER_PARITY",
      name: "teacher and deputy use the identical actual calendar bundle, DOM markup and computed appearance at the same selected month and viewport",
      pass:
        actual.markup === teacherCalendar.markup &&
        actual.className === teacherCalendar.className &&
        JSON.stringify(actual.resources) ===
          JSON.stringify(teacherCalendar.resources) &&
        !styleDifferences.length,
      observed: {
        sameMarkup: actual.markup === teacherCalendar.markup,
        resources: actual.resources,
        styleDifferences,
        actual: actual.styles,
        teacher: teacherCalendar.styles,
      },
    });
    await evaluate(
      "document.querySelector('#calPopup .calendar-close').focus()",
    );
    await key("Tab", 9);
    const trapped = await evaluate(
      "document.activeElement?.dataset.calendarAction",
    );
    await key("Tab", 9, 8);
    const backwards = await evaluate(
      "document.activeElement?.classList.contains('calendar-close')",
    );
    cases.push({
      id: "DEPUTY_SHARED_TAB_TRAP",
      name: "real Tab and Shift+Tab stay inside the shared teacher popup at both focus boundaries",
      pass: trapped === "prev" && backwards,
      observed: { forward: trapped, backwards },
    });
    await key("Escape", 27);
    await settled();
  }
  cases.push(
    ...(await evaluate(
      "(" +
        calendarAndStudent.toString() +
        ")(" +
        JSON.stringify({ ids, expected }) +
        ")",
    )),
  );
  await evaluate(
    "window.print=()=>{};document.querySelector('[data-deputy-action=print]').click()",
  );
  await cdp("Emulation.setEmulatedMedia", { media: "print" });
  try {
    const scope = await evaluate(
        "(()=>{const node=document.getElementById('deputyPrintable');return {metadata:node.querySelector('.ed-selected-student')?.textContent||'',participants:node.querySelectorAll('.ed-participant').length,grades:node.querySelectorAll('.ed-grade').length,archivedLeak:node.textContent.includes('هنرجوی بایگانی آزمایشی'),otherCode:[...node.querySelectorAll('.ed-participant')].some(item=>item.textContent.includes('200')),visible:node.getBoundingClientRect().height>0}})()",
      ),
      pdf = await cdp("Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
      }),
      filename = path.join(artifacts, "deputy-selected-student.pdf");
    fs.writeFileSync(filename, Buffer.from(pdf.data, "base64"));
    cases.push({
      id: "DEPUTY_STUDENT_PDF",
      name: "actual selected-student PDF contains clear identity metadata and no other student's attendance or grades",
      pass:
        scope.visible &&
        scope.metadata.includes("100") &&
        scope.participants === 2 &&
        scope.grades === 3 &&
        !scope.archivedLeak &&
        !scope.otherCode &&
        Buffer.from(pdf.data, "base64").length > 10000,
      observed: { ...scope, pdf: filename },
    });
  } finally {
    await cdp("Emulation.setEmulatedMedia", { media: "", features: [] });
    await evaluate("window.dispatchEvent(new Event('afterprint'))");
  }
  cases.push(
    ...(await evaluate(
      "(" +
        require("./flows/deputyPrivacy.cjs").toString() +
        ")(" +
        JSON.stringify({ ids, expected }) +
        ")",
    )),
  );
};
