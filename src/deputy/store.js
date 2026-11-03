(function (root) {
  "use strict";
  const DATABASE = "EduManagerDeputy",
    VERSION = 1,
    MAX_BACKUP_BYTES = 128 * 1024 * 1024,
    SOURCE_STORE = "sources",
    NOTE_STORE = "followups",
    META_STORE = "meta";
  function fail(message, code = "DEPUTY_STORE_INVALID") {
    throw Object.assign(Error(message), { code });
  }
  function safeInteger(value, minimum = 0) {
    if (!Number.isSafeInteger(value) || value < minimum)
      fail("شمارهٔ بازبینی معتبر نیست.");
    return value;
  }
  function nextRevision(value) {
    return safeInteger(safeInteger(value) + 1, 1);
  }
  function safeId(value) {
    if (
      typeof value !== "string" ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(value) ||
      Object.getOwnPropertyNames(Object.prototype).includes(value)
    )
      fail("شناسهٔ پیگیری نامعتبر است.");
    return value;
  }
  function text(value, max, required = false) {
    if (
      typeof value !== "string" ||
      value.length > max ||
      (required && !value.trim()) ||
      [...value].some((character) => {
        const point = character.charCodeAt(0);
        return point < 32 && ![9, 10, 13].includes(point);
      })
    )
      fail("متن پیگیری نامعتبر است.");
    return value;
  }
  function exact(value, keys) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      fail("ساختار پشتیبان معاون معتبر نیست.");
  }
  function timestamp(value) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    )
      fail("زمان ثبت پیگیری نامعتبر است.");
  }
  function validateNote(note) {
    exact(note, [
      "id",
      "streamKey",
      "classId",
      "studentId",
      "note",
      "status",
      "version",
      "createdAt",
      "updatedAt",
      "snapshot",
    ]);
    safeId(note.id);
    safeId(note.classId);
    safeId(note.studentId);
    text(note.streamKey, 1000, true);
    text(note.note, 4000, true);
    if (!["open", "done"].includes(note.status))
      fail("وضعیت پیگیری نامعتبر است.");
    safeInteger(note.version, 1);
    timestamp(note.createdAt);
    timestamp(note.updatedAt);
    exact(note.snapshot, [
      "schoolName",
      "senderName",
      "className",
      "studentName",
      "studentCode",
    ]);
    for (const field of [
      "schoolName",
      "senderName",
      "className",
      "studentName",
    ])
      text(note.snapshot[field], 1000, true);
    text(note.snapshot.studentCode, 120);
    if (note.createdAt > note.updatedAt) fail("ترتیب زمان پیگیری نامعتبر است.");
    return structuredClone(note);
  }
  function validateBackup(input) {
    root.EduDeputyExchange.assertSafeTree(input, {
      maxBytes: MAX_BACKUP_BYTES,
      maxNodes: 2400000,
    });
    exact(input, [
      "format",
      "version",
      "exportedAt",
      "revision",
      "streams",
      "followups",
    ]);
    if (input.format !== "EduManager.DeputyBackup" || input.version !== 1)
      fail(
        "فقط پشتیبان مستقل کارتابل معاون قابل بازیابی است.",
        "DEPUTY_BACKUP_FORMAT",
      );
    timestamp(input.exportedAt);
    safeInteger(input.revision);
    if (
      !Array.isArray(input.streams) ||
      input.streams.length > 2000 ||
      !Array.isArray(input.followups) ||
      input.followups.length > 100000
    )
      fail("تعداد منابع یا پیگیری‌ها معتبر نیست.");
    const keys = new Set(),
      ids = new Set(),
      streams = input.streams.map((row) => {
        exact(row, ["key", "packet", "version", "receivedAt"]);
        const packet = root.EduDeputyExchange.validate(row.packet),
          key = root.EduDeputyExchange.key(packet);
        if (row.key !== key || keys.has(key))
          fail("منبع تکراری یا شناسهٔ نادرست در پشتیبان.");
        keys.add(key);
        safeInteger(row.version, 1);
        timestamp(row.receivedAt);
        if (row.version > input.revision)
          fail("بازبینی منبع از بازبینی پشتیبان بزرگ‌تر است.");
        return {
          key,
          packet,
          version: row.version,
          receivedAt: row.receivedAt,
        };
      }),
      followups = input.followups.map((row) => {
        const note = validateNote(row);
        if (
          ids.has(note.id) ||
          !keys.has(note.streamKey) ||
          note.version > input.revision
        )
          fail("پیگیری تکراری یا بدون منبع در پشتیبان.");
        ids.add(note.id);
        return note;
      });
    return { ...input, streams, followups };
  }
  function envelope(streams, followups, revision) {
    return {
      format: "EduManager.DeputyBackup",
      version: 1,
      exportedAt: new Date().toISOString(),
      revision,
      streams,
      followups,
    };
  }
  function assertNewSourceIdentity(rows, packet) {
    const collision = rows.find(
      ({ packet: existing }) =>
        existing.sender.code === packet.sender.code &&
        existing.academicYear === packet.academicYear &&
        existing.school.id === packet.school.id &&
        existing.school.code !== packet.school.code &&
        existing.periods.some((old) =>
          packet.periods.some(
            (next) => next.id === old.id && next.termKind === old.termKind,
          ),
        ),
    );
    if (collision)
      fail(
        "این منبع قبلاً با کد مدرسهٔ «" +
          collision.packet.school.code +
          "» دریافت شده است؛ همان کد قبلی را در فایل دبیر نگه دارید. منبع تکراری ساخته نشد.",
        "DEPUTY_IDENTITY_CONFLICT",
      );
  }
  async function open() {
    if (!root.indexedDB)
      fail(
        "مرورگر امکان ذخیرهٔ پایدار کارتابل معاون را ندارد.",
        "DEPUTY_STORAGE_UNAVAILABLE",
      );
    const database = await new Promise((resolve, reject) => {
      let blocked = false;
      const request = root.indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [name, keyPath] of [
          [SOURCE_STORE, "key"],
          [NOTE_STORE, "id"],
          [META_STORE, "id"],
        ])
          if (!db.objectStoreNames.contains(name))
            db.createObjectStore(name, { keyPath });
      };
      request.onerror = () =>
        reject(request.error || Error("بازکردن بانک معاون ناموفق بود."));
      request.onblocked = () => {
        blocked = true;
        reject(
          Object.assign(
            Error(
              "کارتابل معاون در پنجرهٔ دیگری باز است؛ پنجره‌ها را ببندید و دوباره تلاش کنید.",
            ),
            { code: "DEPUTY_STORAGE_BLOCKED" },
          ),
        );
      };
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      };
    });
    let closed = false;
    database.onversionchange = () => {
      closed = true;
      database.close();
    };
    function run(names, mode, action) {
      if (closed)
        return Promise.reject(
          Object.assign(
            Error("اتصال کارتابل بسته شده است؛ صفحه را دوباره باز کنید."),
            { code: "DEPUTY_STORE_CLOSED" },
          ),
        );
      return new Promise((resolve, reject) => {
        let transaction, result, error;
        try {
          transaction = database.transaction(names, mode);
          transaction.oncomplete = () => resolve(structuredClone(result));
          transaction.onabort = () =>
            reject(
              error ||
                transaction.error ||
                Error("عملیات ذخیره لغو شد؛ اطلاعات قبلی حفظ شد."),
            );
          transaction.onerror = () => {
            error ||= transaction.error;
          };
          const abort = (failure) => {
            error = failure;
            try {
              transaction.abort();
            } catch {
              reject(failure);
            }
          };
          const request = (operation, next) => {
            operation.onerror = () => {
              error ||= operation.error;
            };
            operation.onsuccess = () => {
              try {
                next(operation.result);
              } catch (failure) {
                abort(failure);
              }
            };
          };
          action({
            store: (name) => transaction.objectStore(name),
            request,
            result: (value) => {
              result = value;
            },
            abort,
          });
        } catch (failure) {
          if (transaction) {
            error = failure;
            try {
              transaction.abort();
            } catch {
              reject(failure);
            }
          } else reject(failure);
        }
      });
    }
    function capacity({ store, request }, stream, note, revision, next) {
      request(store(SOURCE_STORE).getAll(), (sources) => {
        request(store(NOTE_STORE).getAll(), (followups) => {
          const streams = stream
              ? [...sources.filter((row) => row.key !== stream.key), stream]
              : sources,
            notes = note
              ? [...followups.filter((row) => row.id !== note.id), note]
              : followups;
          // This check is inside the same write transaction as insertion, so
          // two differently coded previews cannot create duplicate sources.
          // Existing historical rows are not merged, renamed or deleted.
          if (stream && !sources.some((row) => row.key === stream.key))
            assertNewSourceIdentity(sources, stream.packet);
          if (streams.length > 2000 || notes.length > 100000)
            fail(
              "ظرفیت منابع یا پیگیری‌ها تکمیل است؛ پیش از ادامه پشتیبان بگیرید.",
              "DEPUTY_SIZE_LIMIT",
            );
          root.EduDeputyExchange.assertSafeTree(
            envelope(streams, notes, revision),
            { maxBytes: MAX_BACKUP_BYTES, maxNodes: 2400000 },
          );
          next();
        });
      });
    }
    const list = () =>
      run([SOURCE_STORE], "readonly", ({ store, request, result }) => {
        request(store(SOURCE_STORE).getAll(), (rows) =>
          result(
            rows.sort(
              (a, b) =>
                b.receivedAt.localeCompare(a.receivedAt) ||
                a.key.localeCompare(b.key),
            ),
          ),
        );
      });
    const followups = () =>
      run([NOTE_STORE], "readonly", ({ store, request, result }) => {
        request(store(NOTE_STORE).getAll(), (rows) =>
          result(
            rows.sort(
              (a, b) =>
                b.updatedAt.localeCompare(a.updatedAt) ||
                a.id.localeCompare(b.id),
            ),
          ),
        );
      });
    async function preview(input) {
      const packet = root.EduDeputyExchange.validate(input),
        key = root.EduDeputyExchange.key(packet);
      return run(
        [SOURCE_STORE, META_STORE],
        "readonly",
        ({ store, request, result }) => {
          request(store(SOURCE_STORE).getAll(), (rows) => {
            const row = rows.find((item) => item.key === key);
            if (!row) assertNewSourceIdentity(rows, packet);
            request(store(META_STORE).get("state"), (state) =>
              result({
                key,
                version: row?.version || 0,
                restoreRevision: safeInteger(state?.restoreRevision || 0),
                packet,
                plan: root.EduDeputyExchange.plan(row?.packet || null, packet),
              }),
            );
          });
        },
      );
    }
    async function commit(preview) {
      const packet = root.EduDeputyExchange.validate(preview?.packet),
        key = root.EduDeputyExchange.key(packet),
        expected = safeInteger(preview.version),
        expectedRestore = safeInteger(preview.restoreRevision ?? 0);
      if (preview.key !== key) fail("پیش‌نمایش به این منبع تعلق ندارد.");
      return run(
        [SOURCE_STORE, NOTE_STORE, META_STORE],
        "readwrite",
        ({ store, request, result }) => {
          request(store(SOURCE_STORE).get(key), (current) => {
            request(store(META_STORE).get("state"), (state) => {
              // A full restore invalidates even an absent-key preview (0 -> 0).
              // Unrelated sender imports do not: the epoch changes only on restore.
              if ((state?.restoreRevision || 0) !== expectedRestore)
                fail(
                  "پس از این پیش‌نمایش، کارتابل از پشتیبان بازیابی شده است؛ فایل را دوباره بررسی کنید.",
                  "DEPUTY_REVISION_CONFLICT",
                );
              if ((current?.version || 0) !== expected)
                fail(
                  "اطلاعات پس از پیش‌نمایش تغییر کرده؛ فایل را دوباره بررسی کنید.",
                  "DEPUTY_REVISION_CONFLICT",
                );
              const plan = root.EduDeputyExchange.plan(
                current?.packet || null,
                packet,
              );
              if (plan.status === "duplicate") {
                result({ ...current, status: "duplicate", plan });
                return;
              }
              const version = nextRevision(state?.revision || 0),
                row = {
                  key,
                  packet,
                  version,
                  receivedAt: new Date().toISOString(),
                };
              capacity({ store, request }, row, null, version, () => {
                store(SOURCE_STORE).put(row);
                store(META_STORE).put({
                  id: "state",
                  revision: version,
                  restoreRevision: state?.restoreRevision || 0,
                });
                result({ ...row, status: plan.status, plan });
              });
            });
          });
        },
      );
    }
    async function saveFollowup(input) {
      exact(input, [
        "id",
        "streamKey",
        "classId",
        "studentId",
        "note",
        "status",
        "version",
      ]);
      root.EduDeputyExchange.assertSafeTree(input);
      const streamKey = text(input.streamKey, 1000, true),
        classId = safeId(input.classId),
        studentId = safeId(input.studentId),
        note = text(input.note, 4000, true).trim(),
        id = input.id ? safeId(input.id) : root.crypto.randomUUID();
      if (!["open", "done"].includes(input.status))
        fail("وضعیت پیگیری نامعتبر است.");
      if (input.version !== undefined) safeInteger(input.version);
      return run(
        [SOURCE_STORE, NOTE_STORE, META_STORE],
        "readwrite",
        ({ store, request, result }) => {
          request(store(NOTE_STORE).get(id), (previous) => {
            if (
              previous &&
              (input.version !== previous.version ||
                previous.streamKey !== streamKey ||
                previous.classId !== classId ||
                previous.studentId !== studentId)
            )
              fail(
                "پیگیری در پنجرهٔ دیگری تغییر کرده است؛ فهرست را دوباره بخوانید.",
                "DEPUTY_REVISION_CONFLICT",
              );
            if (!previous && input.version)
              fail("پیگیری قبلی دیگر وجود ندارد.", "DEPUTY_REVISION_CONFLICT");
            request(store(SOURCE_STORE).get(streamKey), (source) => {
              if (!source) fail("منبع این پیگیری در کارتابل نیست.");
              let reference;
              for (const term of [...source.packet.periods].sort(
                (a, b) =>
                  (a.termKind === "second" ? -1 : 1) -
                  (b.termKind === "second" ? -1 : 1),
              )) {
                const classroom = term.school.classes.find(
                    (item) => item.id === classId,
                  ),
                  student = [
                    ...(classroom?.students || []),
                    ...(classroom?.archivedStudents || []),
                  ].find((item) => item.id === studentId);
                if (student) {
                  reference = {
                    schoolName: source.packet.school.name,
                    senderName: source.packet.sender.name,
                    className: classroom.name,
                    studentName: student.name,
                    studentCode: student.code || "",
                  };
                  break;
                }
              }
              if (!previous && !reference)
                fail(
                  "هنرجو در این منبع وجود ندارد؛ پیگیری جدید قابل ثبت نیست.",
                );
              request(store(META_STORE).get("state"), (state) => {
                const version = nextRevision(state?.revision || 0),
                  now = new Date().toISOString(),
                  row = {
                    id,
                    streamKey,
                    classId,
                    studentId,
                    note,
                    status: input.status,
                    version,
                    createdAt: previous?.createdAt || now,
                    // A corrected device clock must not make an existing
                    // followup permanently uneditable or reverse its history.
                    updatedAt: previous
                      ? new Date(
                          Math.max(
                            Date.parse(now),
                            Date.parse(previous.updatedAt),
                            Date.parse(previous.createdAt),
                          ),
                        ).toISOString()
                      : now,
                    snapshot: previous?.snapshot || reference,
                  };
                validateNote(row);
                capacity({ store, request }, null, row, version, () => {
                  store(NOTE_STORE).put(row);
                  store(META_STORE).put({
                    id: "state",
                    revision: version,
                    restoreRevision: state?.restoreRevision || 0,
                  });
                  result(row);
                });
              });
            });
          });
        },
      );
    }
    const backup = () =>
      run(
        [SOURCE_STORE, NOTE_STORE, META_STORE],
        "readonly",
        ({ store, request, result }) => {
          request(store(META_STORE).get("state"), (state) => {
            request(store(SOURCE_STORE).getAll(), (streams) => {
              request(store(NOTE_STORE).getAll(), (notes) =>
                result(
                  validateBackup(
                    envelope(streams, notes, state?.revision || 0),
                  ),
                ),
              );
            });
          });
        },
      );
    const lastSafetyBackup = () =>
      run([META_STORE], "readonly", ({ store, request, result }) => {
        request(store(META_STORE).get("lastSafety"), (row) =>
          result(row ? validateBackup(row.backup) : null),
        );
      });
    const safetyBackupInfo = () =>
      run([META_STORE], "readonly", ({ store, request, result }) => {
        request(store(META_STORE).get("lastSafetyInfo"), (row) => {
          if (!row) {
            result(null);
            return;
          }
          timestamp(row.exportedAt);
          safeInteger(row.revision);
          safeInteger(row.streams);
          safeInteger(row.followups);
          result({
            exportedAt: row.exportedAt,
            revision: row.revision,
            streams: row.streams,
            followups: row.followups,
          });
        });
      });
    async function restore(input, expectedRevision) {
      if (expectedRevision === undefined)
        expectedRevision = (await backup()).revision;
      safeInteger(expectedRevision);
      const content = validateBackup(input);
      return run(
        [SOURCE_STORE, NOTE_STORE, META_STORE],
        "readwrite",
        ({ store, request, result }) => {
          request(store(META_STORE).get("state"), (state) => {
            if ((state?.revision || 0) !== expectedRevision)
              fail(
                "اطلاعات کارتابل هنگام بررسی پشتیبان تغییر کرده؛ پیش از بازیابی دوباره بررسی کنید.",
                "DEPUTY_REVISION_CONFLICT",
              );
            request(store(SOURCE_STORE).getAll(), (streams) => {
              request(store(NOTE_STORE).getAll(), (notes) => {
                const safety = validateBackup(
                    envelope(streams, notes, state?.revision || 0),
                  ),
                  revision = nextRevision(
                    Math.max(state?.revision || 0, content.revision),
                  );
                // One independent pre-restore snapshot, never a nested copy or
                // a history list. IDB commits this and replacement together.
                store(META_STORE).put({ id: "lastSafety", backup: safety });
                store(META_STORE).put({
                  id: "lastSafetyInfo",
                  exportedAt: safety.exportedAt,
                  revision: safety.revision,
                  streams: streams.length,
                  followups: notes.length,
                });
                store(SOURCE_STORE).clear();
                store(NOTE_STORE).clear();
                for (const row of content.streams)
                  store(SOURCE_STORE).put({ ...row, version: revision });
                for (const row of content.followups)
                  store(NOTE_STORE).put({ ...row, version: revision });
                store(META_STORE).put({
                  id: "state",
                  revision,
                  restoreRevision: revision,
                });
                result({
                  revision,
                  streams: content.streams.length,
                  followups: content.followups.length,
                });
              });
            });
          });
        },
      );
    }

    const automaticBackupConfig = () =>
      run([META_STORE], "readonly", ({ store, request, result }) => {
        request(store(META_STORE).get("automaticFile"), (row) =>
          result(row?.config || null),
        );
      });
    const setAutomaticBackupConfig = (config, expectedId) =>
      run([META_STORE], "readwrite", ({ store, request, result }) => {
        request(store(META_STORE).get("automaticFile"), (row) => {
          if (
            expectedId !== undefined &&
            (row?.config?.connectionId || null) !== expectedId
          ) {
            result(false);
            return;
          }
          if (config) store(META_STORE).put({ id: "automaticFile", config });
          else store(META_STORE).delete("automaticFile");
          result(true);
        });
      });

    return Object.freeze({
      automaticBackupConfig,
      setAutomaticBackupConfig,
      list,
      preview,
      commit,
      followups,
      saveFollowup,
      backup,
      lastSafetyBackup,
      safetyBackupInfo,
      restore,
      close() {
        closed = true;
        database.close();
      },
    });
  }
  root.EduDeputyStore = Object.freeze({
    open,
    validateBackup,
    databaseName: DATABASE,
    maxBackupBytes: MAX_BACKUP_BYTES,
  });
})(globalThis);
