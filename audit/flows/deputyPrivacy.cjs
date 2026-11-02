"use strict";

// Runs inside the isolated browser profile against two real IDB connections.
module.exports = async function deputyPrivacy({ ids, expected }) {
  const cases = [],
    check = (id, name, pass, observed = {}) =>
      cases.push({ id, name, pass: !!pass, observed }),
    wait = async (predicate) => {
      for (let index = 0; index < 180; index++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error(
        "Deputy privacy flow timed out: " + EduDeputyUI.status().message,
      );
    },
    tab = (name) =>
      [...document.querySelectorAll('[data-deputy-tab="' + name + '"]')]
        .find((node) => node.getClientRects().length)
        .click(),
    change = (id, value) => {
      const input = document.getElementById(id);
      if (!input) throw Error("Missing deputy privacy control: " + id);
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selectAudience = (key, student = ids.a) => {
      tab("reports");
      change("deputySource", key);
      change("deputyTerm", "all");
      change("deputyClass", ids.classroom);
      change("deputyStudent", student);
    },
    blocked = () =>
      !document.getElementById("deputyPrintable") &&
      document.querySelector('[data-deputy-action="print"]')?.disabled !==
        false &&
      !!document.querySelector(".ed-warning"),
    store = await EduDeputyStore.open(),
    peer = await EduDeputyStore.open(),
    original = await store.backup(),
    restore = async (value) => {
      await peer.restore(value, (await peer.backup()).revision);
      await EduDeputyUI.refresh();
    };
  try {
    selectAudience(expected.keyB);
    const removed = structuredClone(
      original.streams.find((row) => row.key === expected.keyB).packet,
    );
    removed.id = "deputy_audit_removed_person";
    const eraseScoreKey = (value) => {
      if (!value || typeof value !== "object") return;
      delete value[ids.a];
      for (const child of Object.values(value)) eraseScoreKey(child);
    };
    for (const period of removed.periods) {
      period.revision++;
      for (const classroom of period.school.classes) {
        classroom.students = classroom.students.filter(
          (row) => row.id !== ids.a,
        );
        classroom.archivedStudents = (classroom.archivedStudents || []).filter(
          (row) => row.id !== ids.a,
        );
        eraseScoreKey(classroom.lessons);
      }
      for (const session of period.sessions) {
        session.roster = (session.roster || []).filter(
          (row) => row.id !== ids.a,
        );
        delete session.attendance[ids.a];
        session.scores = session.scores.filter(
          (row) => row.studentId !== ids.a,
        );
      }
    }
    EduDeputyExchange.validate(removed);
    tab("receive");
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([JSON.stringify(removed)], "removed-person.json", {
        type: "application/json",
      }),
    );
    const input = document.getElementById("deputyImportFile");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(
      () =>
        !EduDeputyUI.status().busy &&
        !!document.getElementById("deputyImportPreview"),
    );
    document.querySelector('[data-deputy-action="confirm-import"]').click();
    await wait(
      () =>
        !EduDeputyUI.status().busy &&
        !document.getElementById("deputyImportPreview"),
    );
    tab("reports");
    check(
      "DEPUTY_PERSON_REMOVED_FILE",
      "a real refreshed file removing the selected pupil keeps an orphan selection and blocks printing instead of exposing classmates",
      !EduDeputyUI.status().error &&
        document.getElementById("deputyStudent")?.value === ids.a &&
        blocked(),
      {
        selected: document.getElementById("deputyStudent")?.value,
        blocked: blocked(),
      },
    );
    change("deputyStudent", ids.b);
    check(
      "DEPUTY_PERSON_REMOVED_EXPLICIT",
      "only an explicit choice of a remaining pupil re-enables the scoped report after deletion",
      !!document.getElementById("deputyPrintable") &&
        document
          .querySelector(".ed-selected-student")
          ?.textContent.includes("200") &&
        [...document.querySelectorAll(".ed-participant")].every((node) =>
          node.textContent.includes("200"),
        ),
    );

    await restore(original);
    selectAudience(expected.keyA);
    const otherOnly = structuredClone(original);
    otherOnly.streams = otherOnly.streams.filter(
      (row) => row.key === expected.keyB,
    );
    otherOnly.followups = otherOnly.followups.filter(
      (row) => row.streamKey === expected.keyB,
    );
    EduDeputyStore.validateBackup(otherOnly);
    await restore(otherOnly);
    check(
      "DEPUTY_PERSON_LOST_SOURCE",
      "a second-window restore removing the entire selected source cannot silently switch an individual report to another teacher",
      (await store.list()).length === 1 &&
        document.getElementById("deputySource")?.value === expected.keyA &&
        blocked(),
      {
        selected: document.getElementById("deputySource")?.value,
        blocked: blocked(),
      },
    );
    selectAudience(expected.keyB, ids.b);
    check(
      "DEPUTY_PERSON_LOST_SOURCE_EXPLICIT",
      "explicitly choosing the surviving source and pupil releases the missing-source privacy guard",
      !!document.getElementById("deputyPrintable") &&
        document
          .querySelector(".ed-selected-student")
          ?.textContent.includes("200"),
    );

    await restore(original);
    selectAudience(expected.keyA);
    const rebound = structuredClone(original),
      reboundPacket = rebound.streams.find(
        (row) => row.key === expected.keyA,
      ).packet;
    reboundPacket.id = "deputy_audit_physical_source_rebound";
    reboundPacket.school.id = "deputy_audit_other_physical_school";
    reboundPacket.school.name = "مدرسهٔ دیگر با کد و شناسهٔ هنرجوی تکراری";
    for (const period of reboundPacket.periods) {
      period.id = "rebound_" + period.id;
      period.school.id = reboundPacket.school.id;
      period.school.name = reboundPacket.school.name;
      for (const session of period.sessions)
        session.schoolId = reboundPacket.school.id;
    }
    EduDeputyStore.validateBackup(rebound);
    await restore(rebound);
    check(
      "DEPUTY_PERSON_REBOUND_SOURCE",
      "restoring another physical school and term set under the same human codes cannot reuse a selected local student ID without explicit audience choice",
      document.getElementById("deputySource")?.value === expected.keyA &&
        document.getElementById("deputyStudent")?.value === ids.a &&
        blocked(),
      {
        selected: document.getElementById("deputyStudent")?.value,
        blocked: blocked(),
      },
    );
    change("deputyClass", ids.classroom);
    change("deputyStudent", ids.b);
    check(
      "DEPUTY_PERSON_REBOUND_EXPLICIT",
      "an explicit class and pupil choice acknowledges the replaced physical source before producing a new individual report",
      !!document.getElementById("deputyPrintable") &&
        document
          .querySelector(".ed-selected-student")
          ?.textContent.includes("200"),
    );
  } finally {
    await restore(original);
    selectAudience(expected.keyA);
    change("deputyClass", "");
    peer.close();
    store.close();
  }
  return cases;
};
