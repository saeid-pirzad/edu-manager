"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { main } = require("./data-integrity.cjs");
const { seedReminders } = require("./attendance-reminders-browser.cjs");
async function run({ cdp, evaluate, cases, delay }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "edu-record-edit-"));
  const check = (id, pass, observed) =>
    cases.push({ id: "RECORD_EDIT_" + id, name: id, pass: !!pass, observed });
  const page = (fn, arg) =>
    evaluate("(" + fn.toString() + ")(" + JSON.stringify(arg ?? null) + ")");
  await require("./browser-ready.cjs")({ cdp, evaluate, delay });
  const original = await evaluate("EduV24.snapshotInstallation()");
  try {
    await evaluate("(" + seedReminders.toString() + ")()");
    await evaluate(
      "closeModal();Object.assign(state,{view:'class',schoolId:'reminder-school',classId:'reminder-class',tab:'lessons'});render()",
    );
    for (const kind of ["school", "class", "student", "course"]) {
      const open = async () =>
        page(async (kind) => {
          if (kind === "school")
            await EduV24.openEntityEditor("school", "reminder-school");
          if (kind === "class")
            await EduV24.openEntityEditor(
              "class",
              "reminder-class",
              "reminder-school",
            );
          if (kind === "student")
            await openEditStudentModal("reminder-student-a");
          if (kind === "course") await openLessonConfig("reminder-lesson");
        }, kind);
      const save = async () =>
        page(async (kind) => {
          if (kind === "school" || kind === "class")
            await EduV24.saveEntityEditor();
          if (kind === "student") await EduV24.saveStudent();
          if (kind === "course") {
            try {
              await saveLessonConfig();
            } catch (e) {
              document.getElementById("courseError").textContent = e.message;
            }
          }
        }, kind);
      await open();
      const readonly = await page((kind) => {
        const f = document.querySelector(
          kind === "course" ? "#courseEditor" : "#modal .record-editor",
        );
        return {
          mode: f?.dataset.recordMode,
          fields: [
            ...f.querySelectorAll('input:not([type="hidden"]),select,textarea'),
          ].every((c) => c.disabled || c.matches(":disabled")),
          button: !!f.querySelector("[data-record-enable-edit]"),
          submit: [...f.querySelectorAll('[type="submit"]')].every(
            (b) => getComputedStyle(b).display === "none",
          ),
        };
      }, kind);
      check(
        kind + "_VIEW",
        readonly.mode === "view" &&
          readonly.fields &&
          readonly.button &&
          readonly.submit,
        readonly,
      );
      const before = await evaluate("JSON.stringify(db)");
      await save();
      check(
        kind + "_DIRECT_SAVE_BLOCKED",
        before === (await evaluate("JSON.stringify(db)")),
      );
      await page(
        (kind) =>
          document
            .querySelector(
              (kind === "course" ? "#courseEditor" : "#modal .record-editor") +
                " [data-record-enable-edit]",
            )
            .click(),
        kind,
      );
      check(
        kind + "_UNLOCK",
        await page(
          (kind) =>
            document.querySelector(
              kind === "course" ? "#courseEditor" : "#modal .record-editor",
            ).dataset.recordMode === "edit",
          kind,
        ),
      );
      await page((kind) => {
        const id =
          kind === "student"
            ? "editStudentName"
            : kind === "course"
              ? "course_name"
              : "entityEditName";
        const input = document.getElementById(id);
        input.value += " updated";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, kind);
      await save();
      const persisted = await page((kind) => {
        const s = db.schools[0],
          c = s.classes[0],
          v =
            kind === "school"
              ? s
              : kind === "class"
                ? c
                : kind === "student"
                  ? c.students[0]
                  : c.lessons[0];
        return {
          updated: v.name.endsWith(" updated"),
          id: v.id,
          sessions: db.sessions.length,
        };
      }, kind);
      check(
        kind + "_SAVE",
        persisted.updated && persisted.sessions === 1,
        persisted,
      );
      await open();
      check(
        kind + "_REOPEN_LOCKED",
        await page(
          (kind) =>
            document.querySelector(
              kind === "course" ? "#courseEditor" : "#modal .record-editor",
            ).dataset.recordMode === "view",
          kind,
        ),
      );
      for (const width of [320, 390, 768, 1280]) {
        await cdp("Emulation.setDeviceMetricsOverride", {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await delay(35);
        const geometry = await page((kind) => {
          const f = document.querySelector(
              kind === "course" ? "#courseEditor" : "#modal .record-editor",
            ),
            r = f.getBoundingClientRect(),
            b = f
              .querySelector("[data-record-enable-edit]")
              .getBoundingClientRect();
          return {
            overflow:
              document.documentElement.scrollWidth > innerWidth + 1 ||
              f.scrollWidth > f.clientWidth + 1,
            inside: b.left >= r.left - 1 && b.right <= r.right + 1,
            height: b.height,
          };
        }, kind);
        check(
          kind + "_LAYOUT_" + width,
          !geometry.overflow && geometry.inside && geometry.height >= 44,
          geometry,
        );
        if (width === 390) {
          const shot = await cdp("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(
            path.join(directory, kind + "-390.png"),
            Buffer.from(shot.data, "base64"),
          );
        }
      }
      await page((kind) => {
        const f = document.querySelector(
          kind === "course" ? "#courseEditor" : "#modal .record-editor",
        );
        f.querySelector(
          kind === "course"
            ? "[data-course-cancel]"
            : '[data-workspace-action="close"]',
        ).click();
      }, kind);
    }
    await evaluate("openLessonConfig()");
    check(
      "NEW_COURSE_EDITABLE",
      await evaluate(
        `(()=>{const f=document.getElementById('courseEditor');return f.dataset.recordMode==='edit'&&!f.querySelector('#course_name').disabled&&!f.querySelector('[data-record-enable-edit]')})()`,
      ),
    );
    await evaluate("document.querySelector('[data-course-cancel]').click()");

    await evaluate(
      "(async()=>{db.schools[0].classes[0].lessons[0].kardaneshScores['reminder-student-a']={practical:18,theory:16};await saveDB();await openLessonConfig('reminder-lesson');document.querySelector('#courseEditor [data-record-enable-edit]').click()})()",
    );
    check(
      "HISTORICAL_POLICY_LOCK_SURVIVES",
      await evaluate(
        "!document.getElementById('course_name').disabled&&document.getElementById('course_method').matches(':disabled')&&document.getElementById('course_practicalWeight').matches(':disabled')",
      ),
    );
    await evaluate("document.querySelector('[data-course-cancel]').click()");
    await evaluate("openEditStudentModal('reminder-student-a')");
    await evaluate(
      "window.__detachedRecordForm=document.getElementById('studentEditor');document.querySelector('#studentEditor [data-record-enable-edit]').click();closeModal()",
    );
    check(
      "CLOSED_FORM_ACCESS_EXPIRES",
      await evaluate(
        "(()=>{try{assertRecordEditAccess(window.__detachedRecordForm);return false}catch(e){return true}})()",
      ),
    );

    console.log("Record editor previews: " + directory);
  } finally {
    await evaluate(
      `(async()=>{closeModal();EduV24.previewFullBackup(${JSON.stringify(original)});document.getElementById('fullRestoreConfirmed').checked=true;await EduV24.restoreFullBackup()})()`,
    );
  }
}
module.exports = { run };
if (require.main === module)
  main({ stage: "record-edit-access", runExtra: run }).catch((e) => {
    console.error(e.stack || e);
    process.exitCode = 2;
  });
