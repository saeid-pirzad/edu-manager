"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
async function inspectCsvUx() {
  const cases = [];
  const add = (name, pass) =>
    cases.push({
      id: "CSV-UX-" + innerWidth + "-" + cases.length,
      name,
      pass: !!pass,
    });
  closeModal();
  goSchool(db.schools[0].id);
  goClass(db.schools[0].classes[0].id);
  setTab("students");
  const panel = document.querySelector(".student-import");
  panel.open = true;
  add(
    "CSV panel exposes three steps and distinct template and file controls",
    panel.querySelectorAll(".csv-import-steps li").length === 3 &&
      panel.querySelectorAll("button").length === 2,
  );
  const before = JSON.stringify(db);
  await handleExcelImport({
    target: {
      files: [
        new File(["incorrect\nrow"], "invalid.csv", { type: "text/csv" }),
      ],
      value: "",
    },
  });
  add(
    "invalid CSV reports an inline error without changing records",
    !!panel.querySelector(".csv-import-error").textContent &&
      JSON.stringify(db) === before &&
      !panel.hasAttribute("aria-busy"),
  );
  const c = db.schools[0].classes[0];
  const existing = c.students[0];
  const quote = (text) => '"' + String(text).replaceAll('"', '""') + '"';
  const csv =
    "کد دانش‌آموز,نام و نام خانوادگی\n" +
    "CSV-" +
    innerWidth +
    ",هنرجوی آزمایشی " +
    innerWidth +
    "\n" +
    quote(existing.code || "") +
    "," +
    quote(existing.name) +
    "\n" +
    "CSV-X-" +
    innerWidth +
    "," +
    quote('<img src=x onerror="alert(1)">') +
    "\n";
  await handleExcelImport({
    target: {
      files: [new File([csv], "فهرست-هنرجویان.csv", { type: "text/csv" })],
      value: "",
    },
  });
  const form = document.getElementById("studentCSVEditor");
  add(
    "preview is non-mutating and distinguishes fresh and existing or same-name students",
    !!form &&
      form.querySelectorAll(".csv-preview-row").length === 3 &&
      form.querySelectorAll(".needs-review").length === 1 &&
      form.querySelector("#csvDecision1").value === "skip" &&
      JSON.stringify(db) === before,
  );
  add(
    "CSV preview escapes user-controlled names and has no inline executable markup",
    !form.querySelector("img") &&
      form.textContent.includes("<img") &&
      ![...form.querySelectorAll("*")].some((el) =>
        [...el.attributes].some((attr) => /^on/i.test(attr.name)),
      ),
  );
  add(
    "CSV preview fits mobile and desktop without page-level horizontal scrolling",
    form.scrollWidth <= form.clientWidth + 1 &&
      [...form.querySelectorAll("select,button")].every((control) => {
        const rect = control.getBoundingClientRect();
        return (
          rect.left >= 0 && rect.right <= innerWidth + 1 && rect.height >= 44
        );
      }),
  );
  add(
    "CSV preview has labelled decisions and no redundant change-review panel",
    [...form.querySelectorAll("select")].every(
      (control) => control.labels.length === 1,
    ) && !form.querySelector(".record-editor-review"),
  );
  return cases;
}
async function inspectCsvCommit() {
  const form = document.getElementById("studentCSVEditor");
  const classroom = db.schools[0].classes[0];
  const count = classroom.students.length;
  const before = JSON.stringify(db);
  for (const control of form.querySelectorAll("select")) control.value = "skip";
  const submit = () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  submit();
  for (
    let attempt = 0;
    attempt < 100 && !document.getElementById("operationError").textContent;
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  const noChanges =
    !!document.getElementById("operationError").textContent &&
    JSON.stringify(db) === before;
  document.getElementById("csvDecision0").value = "add";
  submit();
  for (
    let attempt = 0;
    attempt < 200 &&
    !document.getElementById("modal").classList.contains("hidden");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  return [
    {
      id: "CSV-COMMIT-EMPTY",
      name: "all-skipped CSV decisions show an error without modifying data",
      pass: noChanges,
    },
    {
      id: "CSV-COMMIT-SELECTED",
      name: "CSV confirmation imports only selected students and closes after saving",
      pass:
        classroom.students.length === count + 1 &&
        classroom.students.some((student) => student.code === "CSV-1280") &&
        !classroom.students.some((student) => student.code === "CSV-X-1280") &&
        document.getElementById("modal").classList.contains("hidden"),
    },
  ];
}
module.exports = async function csvUx({ cdp, evaluate, cases, delay }) {
  const previews = fs.mkdtempSync(path.join(os.tmpdir(), "edu-csv-ux-"));
  for (const width of [320, 390, 768, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    cases.push(...(await evaluate("(" + inspectCsvUx.toString() + ")()")));
    await delay(100);
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(previews, width + "-preview.png"),
      Buffer.from(shot.data, "base64"),
    );
    if (width === 1280) {
      cases.push(
        ...(await evaluate("(" + inspectCsvCommit.toString() + ")()")),
      );
      continue;
    }
    cases.push(
      ...(await evaluate(
        "(async()=>{const before=JSON.stringify(db);document.querySelector('#studentCSVEditor [data-workspace-action=close]').click();return [{id:'CSV-CANCEL-'+innerWidth,name:'cancelling CSV preview preserves all records',pass:JSON.stringify(db)===before&&document.getElementById('modal').classList.contains('hidden')}];})()",
      )),
    );
  }
  console.log("CSV previews: " + previews);
};
