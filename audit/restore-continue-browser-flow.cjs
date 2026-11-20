"use strict";

// Runs inside the existing disposable-origin hub audit. OPFS supplies genuine,
// structured-cloneable handles, so the production IndexedDB connection path is
// exercised without opening a user's files or replacing native handles with mocks.
async function inspectRestoreContinuation(scope) {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 30)),
    wait = async (predicate, description) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        try {
          if (await predicate()) return;
        } catch (error) {
          // A native File snapshot can become unreadable when an in-flight
          // save closes between getFile() and text(). Poll the next snapshot.
          if (error.name !== "NotReadableError") throw error;
        }
        await tick();
      }
      const config = await connection();
      throw Error(
        scope +
          ": timed out waiting for " +
          description +
          ": " +
          JSON.stringify({
            marker: await appMarker(),
            file: config?.handle?.name,
            savedAt: config?.savedAt,
            suspension: config?.suspension || config?.suspended,
            bankStatus: school
              ? undefined
              : EduQuestionBankFileBackup.service.state(),
            operation: document.getElementById("operationError")?.textContent,
            notice: document.querySelector(".qb-backup-message")?.textContent,
            status: EduV24.test.getState().status,
          }),
      );
    },
    directory = await navigator.storage.getDirectory(),
    school = scope === "school",
    prefix = school ? "Classyar-Classroom" : "Classyar-QuestionBank",
    offset = school ? 941 : 951,
    handles = await Promise.all(
      [0, 1, 2].map((index) =>
        directory.getFileHandle(prefix + " (" + (offset + index) + ").json", {
          create: true,
        }),
      ),
    ),
    [fileA, fileB, fileC] = handles,
    picker = window.showSaveFilePicker,
    openPicker = window.showOpenFilePicker,
    permissionPrototype = FileSystemHandle.prototype,
    permissionDescriptor = Object.getOwnPropertyDescriptor(
      permissionPrototype,
      "requestPermission",
    ),
    markerA = "restore-continue-" + scope + "-A",
    markerB = "restore-continue-" + scope + "-B",
    markerC = "restore-continue-" + scope + "-C",
    later = markerB + "-edited",
    results = [];
  const record = (name, pass, observed = {}) => {
    results.push({ name, pass: !!pass, observed });
    if (!pass)
      throw Error(scope + " " + name + ": " + JSON.stringify(observed));
  };
  const connection = async () => {
      if (!school) return EduQuestionBankRepository.readBackup();
      return new Promise((resolve, reject) => {
        const tx = EduV24.test.getConnection().transaction("drafts"),
          request = tx.objectStore("drafts").get("EduManager.singleFile");
        tx.oncomplete = () => resolve(request.result || null);
        tx.onabort = () => reject(tx.error);
      });
    },
    sameHandle = async (config, handle) =>
      !!config?.handle && (await config.handle.isSameEntry(handle)),
    readText = async (handle) => (await handle.getFile()).text(),
    writeText = async (handle, text) => {
      const stream = await handle.createWritable();
      await stream.write(text);
      await stream.close();
    },
    snapshot = () =>
      school ? EduV24.snapshotInstallation() : EduQuestionBankRepository.read(),
    appMarker = async () =>
      school
        ? EduV24.test.getState().db.schools[0]?.name
        : (await EduQuestionBankRepository.read()).courses[0]?.title,
    fileMarker = async (handle) => {
      const value = JSON.parse(await readText(handle));
      return school
        ? EduV24.validateFullBackup(value).find(
            ({ period }) => period.id === value.activeWorkspace,
          )?.data.schools[0]?.name
        : EduQuestionBank.validate(value).courses[0]?.title;
    },
    otherScope = async () => {
      if (school) return JSON.stringify(await EduQuestionBankRepository.read());
      const value = await EduV24.snapshotInstallation();
      return JSON.stringify({
        stores: value.stores,
        reportDrafts: value.reportDrafts,
        gradeDrafts: value.gradeDrafts,
      });
    },
    openHub = async () => {
      closeModal();
      await tick();
      await EduV24.openBackups({ tab: scope });
      if (!school)
        await wait(
          () => !!document.querySelector("#backupBankPanel .qb-backup-restore"),
          "bank restore control",
        );
    },
    control = (kind) =>
      document.querySelector(
        school
          ? '#backupSchoolPanel [data-workspace-action="' +
              (kind === "restore" ? "choose-import" : "single-file-" + kind) +
              '"]'
          : "#backupBankPanel .qb-" +
              (kind === "restore" ? "backup-restore" : "file-" + kind),
      ),
    preview = async (handle) => {
      await openHub();
      window.showOpenFilePicker = async () => [handle];
      control("restore").click();
      await wait(() => {
        const node = document.querySelector(
          school ? ".full-restore" : ".qb-backup-confirm",
        );
        return (
          !!node?.checkVisibility() && node.textContent.includes(handle.name)
        );
      }, "restore preview");
    },
    approve = () => {
      if (school) {
        document.getElementById("fullRestoreConfirmed").checked = true;
        document
          .querySelector('[data-workspace-action="restore-full"]')
          .click();
      } else {
        const buttons = [
          ...document.querySelectorAll(".qb-backup-confirm button"),
        ];
        buttons.find((button) => button.textContent === "تأیید").click();
      }
    },
    connectedAndSaved = async (handle) => {
      const config = await connection();
      return (
        (await sameHandle(config, handle)) &&
        !!config.savedAt &&
        !(school ? config.suspension : config.suspended) &&
        (school || EduQuestionBankFileBackup.service.state().state === "active")
      );
    },
    setMarker = async (marker) => {
      if (school) {
        const source = EduV24.test.getState().db;
        source.schools = [
          { id: "restore-continue-school", name: marker, classes: [] },
        ];
        await EduV24.saveDB({ action: "synthetic restore continuation edit" });
        await EduV24.test.settle();
      } else {
        const source = await EduQuestionBankRepository.read();
        await EduQuestionBankRepository.save(
          {
            ...EduQuestionBank.empty(),
            courses: [
              {
                id: "restore-continue-course",
                title: marker,
                structure: "chapter",
              },
            ],
          },
          source.revision,
        );
      }
    },
    backupWithMarker = async (marker) => {
      const value = structuredClone(await snapshot());
      if (school) {
        const row = value.stores.records.find(
          (record) =>
            record.workspace === value.activeWorkspace &&
            record.logical === "meta",
        );
        row.value.layout[0].name = marker;
        EduV24.validateFullBackup(value);
      } else {
        value.courses[0].title = marker;
        EduQuestionBank.validate(value);
      }
      return JSON.stringify(value);
    };
  try {
    await setMarker(markerA);
    await openHub();
    window.showSaveFilePicker = async () => fileA;
    control("choose").click();
    await wait(() => connectedAndSaved(fileA), "initial connection to A");
    const savedA = await readText(fileA),
      incomingB = await backupWithMarker(markerB),
      otherBefore = await otherScope();
    await writeText(fileB, incomingB);
    await preview(fileB);
    record(
      "preview leaves app, both native files and current destination unchanged",
      (await appMarker()) === markerA &&
        (await sameHandle(await connection(), fileA)) &&
        (await readText(fileA)) === savedA &&
        (await readText(fileB)) === incomingB,
    );
    const cancel = school
      ? document.querySelector('.full-restore [data-workspace-action="close"]')
      : [...document.querySelectorAll(".qb-backup-confirm button")].find(
          (button) => button.textContent === "انصراف",
        );
    cancel.click();
    await tick();
    record(
      "cancelling preview preserves A and the independent database",
      (await appMarker()) === markerA &&
        (await sameHandle(await connection(), fileA)) &&
        (await otherScope()) === otherBefore,
    );
    await preview(fileB);
    approve();
    await wait(
      async () =>
        (await appMarker()) === markerB && (await connectedAndSaved(fileB)),
      "restored B and verified source-file connection",
    );
    record(
      "confirmed restore adopts the exact cloneable source handle and leaves A untouched",
      (await connection()).handle instanceof FileSystemFileHandle &&
        (await fileMarker(fileB)) === markerB &&
        (await readText(fileA)) === savedA &&
        (await otherScope()) === otherBefore,
    );
    await setMarker(later);
    await openHub();
    control("save").click();
    await wait(
      async () =>
        (await fileMarker(fileB)) === later && (await connectedAndSaved(fileB)),
      "subsequent save to B",
    );
    const laterSave = {
      connectedAndSaved: await connectedAndSaved(fileB),
      originalFileUnchanged: (await readText(fileA)) === savedA,
      independentDataUnchanged: (await otherScope()) === otherBefore,
    };
    record(
      "later edits save into B while A and the other scope remain byte-for-byte unchanged",
      Object.values(laterSave).every(Boolean),
      laterSave,
    );
    const savedB = await readText(fileB),
      incomingC = await backupWithMarker(markerC);
    await writeText(fileC, incomingC);
    // Override only permission responses on the native prototype. Every file
    // used by production and persisted into IndexedDB remains a native handle.
    Object.defineProperty(permissionPrototype, "requestPermission", {
      ...permissionDescriptor,
      value: function (options) {
        return this.name === fileC.name
          ? Promise.resolve("denied")
          : permissionDescriptor.value.call(this, options);
      },
    });
    await preview(fileC);
    approve();
    await wait(async () => {
      const config = await connection();
      return (
        (await appMarker()) === markerC &&
        (await sameHandle(config, fileC)) &&
        !!(school ? config.suspension : config.suspended)
      );
    }, "restore with denied write permission");
    record(
      "denied permission still restores C, keeps it paused and never writes C or the old targets",
      !(await connection()).savedAt &&
        (await readText(fileC)) === incomingC &&
        (await readText(fileB)) === savedB &&
        (await readText(fileA)) === savedA &&
        (await otherScope()) === otherBefore,
    );
    Object.defineProperty(
      permissionPrototype,
      "requestPermission",
      permissionDescriptor,
    );
    await openHub();
    control("save").click();
    await wait(
      () => connectedAndSaved(fileC),
      "explicit permission retry on C",
    );
    record(
      "explicit save retries permission and activates C without returning to an old destination",
      (await fileMarker(fileC)) === markerC &&
        (await readText(fileA)) === savedA &&
        (await readText(fileB)) === savedB &&
        (await otherScope()) === otherBefore,
    );
    return results;
  } catch (error) {
    throw Error(
      scope +
        " restore continuation after " +
        results.length +
        " completed checks: " +
        error.name +
        ": " +
        error.message,
      { cause: error },
    );
  } finally {
    window.showSaveFilePicker = picker;
    window.showOpenFilePicker = openPicker;
    Object.defineProperty(
      permissionPrototype,
      "requestPermission",
      permissionDescriptor,
    );
  }
}

module.exports = async function restoreContinueBrowserFlow({
  evaluateGesture,
  check,
}) {
  for (const scope of ["school", "bank"]) {
    const results = await evaluateGesture(
      "(" +
        inspectRestoreContinuation.toString() +
        ")(" +
        JSON.stringify(scope) +
        ")",
    );
    for (const result of results)
      check(
        scope + " restore continuation: " + result.name,
        result.pass,
        result.observed,
      );
  }
};
