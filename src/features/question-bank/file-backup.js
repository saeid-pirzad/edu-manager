(function (root) {
  "use strict";
  function assertFileName(name, { allowText = false } = {}) {
    if (
      typeof name !== "string" ||
      !(
        allowText
          ? /^Classyar-QuestionBank(?: ?\([1-9]\d*\))?\.(?:json|txt)$/
          : /^Classyar-QuestionBank(?: ?\([1-9]\d*\))?\.json$/
      ).test(name)
    )
      throw Error(
        "نام فایل بانک سؤال باید Classyar-QuestionBank.json یا نسخهٔ شماره‌دار آن مانند Classyar-QuestionBank(1).json باشد. نام فعلی: «" +
          (typeof name === "string" ? name : "نامشخص") +
          "». فایل‌های قدیمی را ابتدا تغییر نام دهید و دوباره انتخاب کنید؛ محتوای آن‌ها نیز بررسی می‌شود.",
      );
  }
  // File handles stay device-local; they never enter the exported bank JSON.
  function createFileBackup(repository, host = root) {
    const D = root.EduQuestionBank;
    let config = null,
      initialized,
      timer,
      debounce,
      choosing = false,
      clearing = false,
      restoring = false;
    const listeners = new Set();
    const restorePreviews = new WeakMap();
    let status = {
      state: "inactive",
      message: "ذخیرهٔ خودکار فایل فعال نیست.",
    };
    const supported = () =>
      !!(
        host.isSecureContext &&
        host.showSaveFilePicker &&
        host.navigator?.locks?.request &&
        host.crypto?.subtle
      );
    function notify(state, message) {
      status = {
        state,
        message,
        name: config?.handle?.name || "",
        savedAt: config?.savedAt || "",
        connected: !!config,
      };
      for (const listener of listeners) listener({ ...status });
      if (host === root)
        root.dispatchEvent?.(new Event("edu-question-bank-file-status"));
    }
    const locked = (action) =>
      host.navigator.locks.request("ClassyarQuestionBank.file", action);
    const cancelled = () => {
      const error = Error("عملیات فایل لغو شد؛ بخش پشتیبان دیگر فعال نیست.");
      error.code = "question-bank-file-cancelled";
      return error;
    };
    const assertCurrent = (isCurrent) => {
      if (!isCurrent()) throw cancelled();
    };
    const isCancelled = (error) =>
      error?.code === "question-bank-file-cancelled";
    function restoreStatus(previous) {
      if (previous && status.state === "busy")
        notify(previous.state, previous.message);
    }
    const writtenAfterClose = (written = true) =>
      Error(
        (written
          ? "فایل نوشته شد، اما ثبت اتصال کامل نشد؛ "
          : "بستن فایل آغاز شد و ممکن است محتوای آن تغییر کرده باشد؛ ") +
          "بخش پشتیبان بسته شده است. وضعیت فایل و اتصال را بررسی کنید.",
      );
    const counts = (bank) =>
      Object.fromEntries(
        ["courses", "units", "questions", "exams"].map((key) => [
          key,
          bank[key].length,
        ]),
      );
    function contents(bank) {
      // Revisions belong to this device's optimistic save sequence. Restoring a
      // backup changes that revision without changing its educational content.
      // JSON object key order is immaterial; array order remains significant.
      return JSON.stringify({ ...bank, revision: 0 }, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, value[key]]),
            )
          : value,
      );
    }
    function dropped(before, after) {
      return (
        before &&
        Object.keys(after).some(
          (key) =>
            (before[key] > 0 && after[key] === 0) ||
            (before[key] >= 10 && after[key] <= before[key] / 2),
        )
      );
    }
    async function hash(text) {
      const bytes = await host.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      );
      return Array.from(new Uint8Array(bytes), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
    }
    async function inspect(handle, allowEmpty = false) {
      assertFileName(handle.name);
      const file = await handle.getFile();
      if (typeof file.name === "string") assertFileName(file.name);
      if (file.size > D.LIMIT)
        throw Error("فایل بزرگ‌تر از سقف ۲۰ مگابایت است؛ تغییر نکرد.");
      const text = await file.text();
      const bank = !text && allowEmpty ? null : D.parse(text);
      return { text, bank, hash: await hash(text) };
    }
    function failed(error) {
      notify(
        "error",
        `${error.message || error} وضعیت فایل را بررسی کنید؛ پشتیبان دستی بگیرید.`,
      );
      return false;
    }
    async function write(
      handle,
      json,
      expectedHash,
      allowEmpty = false,
      isCurrent = () => true,
    ) {
      let stream,
        closeStarted = false,
        committed = false;
      try {
        // Source reads and serialization can yield after the earlier inspection.
        // Recheck the destination before opening a stream that could replace it.
        const before = await inspect(handle, allowEmpty);
        assertCurrent(isCurrent);
        if (before.hash !== expectedHash)
          throw Error("فایل پیش از نوشتن تغییر کرد؛ بازنویسی نشد.");
        stream = await handle.createWritable();
        assertCurrent(isCurrent);
        await stream.write(json);
        assertCurrent(isCurrent);
        // Closing commits the file. Once it starts, finishing verification is
        // necessary even if the page is retired while the close is pending.
        closeStarted = true;
        await stream.close();
        committed = true;
        stream = null;
        const verified = await inspect(handle);
        if (verified.text !== json)
          throw Error("محتوای فایل پس از نوشتن تأیید نشد.");
        return verified.hash;
      } catch (error) {
        if (closeStarted) error.fileCommitStarted = true;
        if (committed) error.fileCommitted = true;
        if (stream) await stream.abort().catch(() => {});
        throw error;
      }
    }
    function active() {
      notify(
        "active",
        `ذخیره شد: ${config.handle.name} — ${new Date(config.savedAt).toLocaleString("fa-IR")}`,
      );
    }
    async function sync({
      approved = false,
      expectedId,
      expectedRevision,
      resumeRestored = false,
      isCurrent = () => true,
    } = {}) {
      if (!supported() || !isCurrent()) return false;
      return locked(async () => {
        const previousStatus = { ...status };
        let fileWritten = false;
        try {
          assertCurrent(isCurrent);
          config = await repository.readBackup();
          assertCurrent(isCurrent);
          if (!config) {
            notify("inactive", "ذخیرهٔ خودکار فایل فعال نیست.");
            return false;
          }
          if (expectedId && config.id !== expectedId)
            throw Error("اتصال فایل تغییر کرد؛ نوشته نشد.");
          const permission = await config.handle.queryPermission({
            mode: "readwrite",
          });
          assertCurrent(isCurrent);
          if (permission !== "granted") {
            notify("permission", "مجوز فایل نیاز به تأیید دارد.");
            return false;
          }
          if (
            config.suspended &&
            !approved &&
            !(resumeRestored && config.suspended === "restore-source")
          ) {
            notify(
              "paused",
              "نوشتن فایل برای حفظ نسخهٔ قبلی متوقف است؛ نسخهٔ قبلی را نگه دارید و برای ادامه «ذخیره اکنون» را بزنید.",
            );
            return false;
          }
          const current = await inspect(config.handle);
          assertCurrent(isCurrent);
          if (current.hash !== config.hash)
            throw Error(
              "فایل بیرون از این اتصال تغییر کرده؛ فایل تازه‌ای انتخاب کنید.",
            );
          const bank = D.validate(await repository.read());
          assertCurrent(isCurrent);
          if (approved && bank.revision !== expectedRevision)
            throw Error("اطلاعات پس از تأیید تغییر کرد؛ دوباره بررسی کنید.");
          const baseline = counts(bank);
          if (
            !approved &&
            (dropped(config.counts, baseline) ||
              dropped(counts(current.bank), baseline))
          ) {
            const next = { ...config, suspended: "source-drop" };
            await repository.writeBackup(next, { isCurrent });
            config = next;
            notify(
              "paused",
              "کاهش شدید اطلاعات شناسایی شد؛ برای حفظ نسخهٔ قبلی، فایل تغییر نکرد. ادامه فقط با تأیید شماست.",
            );
            return false;
          }
          const json = D.size(bank);
          if (current.text === json) {
            if (config.suspended) {
              const next = {
                ...config,
                savedAt: config.savedAt || new Date().toISOString(),
              };
              delete next.suspended;
              await repository.writeBackup(next, { isCurrent });
              config = next;
            }
            active();
            return true;
          }
          notify("busy", "در حال ذخیره و بررسی فایل بانک سؤال…");
          const fingerprint = await write(
            config.handle,
            json,
            current.hash,
            false,
            isCurrent,
          );
          fileWritten = true;
          assertCurrent(isCurrent);
          const next = {
            ...config,
            hash: fingerprint,
            counts: baseline,
            savedAt: new Date().toISOString(),
          };
          delete next.suspended;
          await repository.writeBackup(next, { isCurrent });
          config = next;
          active();
          return true;
        } catch (error) {
          if (isCancelled(error) || !isCurrent()) {
            if (fileWritten || error.fileCommitStarted)
              return failed(
                writtenAfterClose(fileWritten || error.fileCommitted),
              );
            restoreStatus(previousStatus);
            return false;
          }
          return failed(error);
        }
      });
    }
    function schedule() {
      if (!supported() || clearing || restoring) return;
      host.clearTimeout(debounce);
      debounce = host.setTimeout(() => {
        sync().catch(failed);
      }, 2000);
    }
    async function init() {
      if (initialized) return initialized;
      initialized = (async () => {
        try {
          config = await repository.readBackup();
          if (!supported()) {
            notify(
              "unsupported",
              "این مرورگر ذخیرهٔ خودکار فایل را پشتیبانی نمی‌کند؛ پشتیبان دستی در دسترس است. برای ذخیرهٔ خودکار از Chrome یا Edge استفاده کنید.",
            );
            return;
          }
          if (!timer)
            timer = host.setInterval(() => {
              sync().catch(failed);
            }, 30000);
          if (config) await sync();
          else notify("inactive", "ذخیرهٔ خودکار فایل فعال نیست.");
        } catch (error) {
          failed(error);
        }
      })();
      return initialized;
    }
    function suggestedName() {
      return "Classyar-QuestionBank.json";
    }
    async function choose({ isCurrent = () => true } = {}) {
      if (choosing || clearing || restoring || !supported() || !isCurrent())
        return false;
      choosing = true;
      try {
        // Invoke the picker before awaiting storage, preserving the click gesture.
        const selection = host.showSaveFilePicker({
          suggestedName: suggestedName(),
          excludeAcceptAllOption: true,
          types: [
            {
              description: "Question bank JSON",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        // Start the source snapshot while the picker is open. A clear in another
        // window must not turn an old pending selection into an empty-file write.
        const initialBank = repository.read();
        const [handle, selectedFrom] = await Promise.all([
          selection,
          initialBank,
        ]);
        assertCurrent(isCurrent);
        if (handle.kind !== "file" || !/\.json$/i.test(handle.name))
          throw Error("فقط فایل JSON بانک سؤال انتخاب کنید.");
        return await locked(async () => {
          const previousStatus = { ...status };
          let fileWritten = false;
          try {
            assertCurrent(isCurrent);
            config = await repository.readBackup();
            assertCurrent(isCurrent);
            const before = await inspect(handle, true);
            assertCurrent(isCurrent);
            const bank = D.validate(await repository.read());
            assertCurrent(isCurrent);
            if (bank.revision !== selectedFrom.revision)
              throw Error(
                "اطلاعات بانک هنگام انتخاب فایل تغییر کرد؛ فایل نوشته نشد. دوباره فایل را انتخاب کنید.",
              );
            const json = D.size(bank);
            // Never silently replace a populated, different backup during selection.
            if (before.bank && contents(before.bank) !== contents(bank))
              throw Error(
                "برای حفظ محتوای این فایل، فایل تازه‌ای بسازید؛ اگر قصد بازیابی دارید از بخش بازیابی استفاده کنید.",
              );
            const rechecked = await inspect(handle, true);
            assertCurrent(isCurrent);
            if (rechecked.hash !== before.hash)
              throw Error("فایل هنگام انتخاب تغییر کرد؛ نوشته نشد.");
            notify("busy", "در حال اولین ذخیره و بررسی فایل…");
            const fingerprint = await write(
              handle,
              json,
              rechecked.hash,
              true,
              isCurrent,
            );
            fileWritten = true;
            assertCurrent(isCurrent);
            const next = {
              id: host.crypto.randomUUID(),
              handle,
              hash: fingerprint,
              counts: counts(bank),
              savedAt: new Date().toISOString(),
            };
            await repository.writeBackup(next, { isCurrent });
            config = next;
            active();
            return true;
          } catch (error) {
            if (isCancelled(error) || !isCurrent()) {
              if (fileWritten || error.fileCommitStarted)
                return failed(
                  writtenAfterClose(fileWritten || error.fileCommitted),
                );
              restoreStatus(previousStatus);
              return false;
            }
            throw error;
          }
        });
      } catch (error) {
        return error.name === "AbortError" || isCancelled(error)
          ? false
          : failed(error);
      } finally {
        choosing = false;
      }
    }
    async function saveNow(
      approve = () => false,
      { isCurrent = () => true } = {},
    ) {
      if (clearing || restoring || !supported() || !config || !isCurrent())
        return false;
      const target = config;
      try {
        // Permission must also be requested directly in the user's click.
        const permission = await target.handle.requestPermission({
          mode: "readwrite",
        });
        assertCurrent(isCurrent);
        if (permission !== "granted") {
          notify("permission", "اجازهٔ نوشتن داده نشد؛ فایل تغییر نکرد.");
          return false;
        }
        if (
          await sync({
            expectedId: target.id,
            resumeRestored: true,
            isCurrent,
          })
        )
          return true;
        assertCurrent(isCurrent);
        if (status.state !== "paused") return false;
        const preview = D.validate(await repository.read());
        assertCurrent(isCurrent);
        const accepted = await approve(target.handle.name, counts(preview));
        if (!accepted) return false;
        assertCurrent(isCurrent);
        const current = await repository.readBackup();
        assertCurrent(isCurrent);
        if (current?.id !== target.id)
          throw Error("اتصال فایل تغییر کرده است؛ دوباره بررسی کنید.");
        return sync({
          approved: true,
          expectedId: target.id,
          expectedRevision: preview.revision,
          isCurrent,
        });
      } catch (error) {
        if (isCancelled(error) || !isCurrent()) return false;
        return failed(error);
      }
    }
    async function readRestoreSource(source) {
      const handle = typeof source?.getFile === "function" ? source : null;
      if (handle && handle.kind !== "file")
        throw Error("فقط فایل پشتیبان بانک سؤال را انتخاب کنید.");
      if (handle) assertFileName(handle.name, { allowText: true });
      const file = handle ? await handle.getFile() : source;
      const name = handle?.name || file?.name;
      assertFileName(name, { allowText: true });
      if (typeof file?.name === "string") {
        assertFileName(file.name, { allowText: true });
        if (file.name !== name)
          throw Error("نام فایل هنگام خواندن تغییر کرد؛ دوباره انتخاب کنید.");
      }
      if (!file || typeof file.text !== "function")
        throw Error("خواندن فایل پشتیبان ممکن نیست.");
      if (file.size > D.LIMIT) throw Error("سقف فایل ورودی ۲۰ مگابایت است.");
      const text = await file.text();
      if (!text.trim())
        throw Error(
          "فایل خالی قابل بازیابی نیست؛ برای ذخیرهٔ اطلاعات فعلی در آن، «انتخاب فایل برای ذخیره» را بزنید.",
        );
      return {
        source,
        handle,
        name,
        size: file.size,
        lastModified: file.lastModified,
        text,
        bank: D.parse(text),
      };
    }
    const sameRestoreSource = (a, b) =>
      a.name === b.name &&
      a.size === b.size &&
      a.lastModified === b.lastModified &&
      a.text === b.text;
    async function previewRestore(source, { isCurrent = () => true } = {}) {
      assertCurrent(isCurrent);
      const selected = await readRestoreSource(source);
      assertCurrent(isCurrent);
      const [bank, target] = await Promise.all([
        repository.read(),
        repository.readBackup(),
      ]);
      assertCurrent(isCurrent);
      const preview = Object.freeze({
        name: selected.name,
        counts: Object.freeze(counts(selected.bank)),
        connectable: Boolean(
          selected.handle && /\.json$/.test(selected.name) && supported(),
        ),
      });
      restorePreviews.set(preview, {
        ...selected,
        revision: D.validate(bank).revision,
        connectionId: target?.id || null,
      });
      return preview;
    }
    async function restore(preview, { isCurrent = () => true } = {}) {
      const selected = restorePreviews.get(preview);
      if (!selected) throw Error("فایل را دوباره برای بازیابی انتخاب کنید.");
      assertCurrent(isCurrent);
      if (choosing || clearing || restoring)
        throw Error("عملیات فایل دیگری در حال انجام است؛ کمی صبر کنید.");
      restoring = true;
      restorePreviews.delete(preview);
      let saved,
        attached = false,
        nextId,
        permission = "denied";
      const result = (message, active = false) => ({
        restored: Boolean(saved),
        connected: attached,
        active,
        message,
      });
      try {
        // Begin the permission request in the explicit confirmation click,
        // before waiting for storage or the cross-window file writer lock.
        let requested;
        try {
          requested =
            preview.connectable && selected.handle.requestPermission
              ? selected.handle.requestPermission({ mode: "readwrite" })
              : Promise.resolve("denied");
        } catch {
          requested = Promise.resolve("denied");
        }
        permission = await Promise.resolve(requested).catch(() => "denied");
        if (initialized) await initialized;
        assertCurrent(isCurrent);
        const commit = async () => {
          assertCurrent(isCurrent);
          const current = await repository.readBackup();
          assertCurrent(isCurrent);
          if ((current?.id || null) !== selected.connectionId)
            throw Error(
              "اتصال فایل پس از پیش‌نمایش تغییر کرده؛ دوباره بررسی کنید.",
            );
          if ((await repository.read()).revision !== selected.revision)
            throw Error("بانک پس از پیش‌نمایش تغییر کرده؛ دوباره بررسی کنید.");
          const source = await readRestoreSource(selected.source);
          assertCurrent(isCurrent);
          if (!sameRestoreSource(selected, source))
            throw Error("فایل پس از پیش‌نمایش تغییر کرده؛ بازیابی نشد.");
          config = current;
          // All file writers take this lock. Persist the pause before saving
          // the replacement bank, so even a later failure cannot overwrite A.
          if (current) {
            config = { ...current, suspended: "restore" };
            await repository.writeBackup(config, { isCurrent });
            notify("paused", "فایل قبلی برای حفظ اطلاعات آن متوقف شد.");
          }
          assertCurrent(isCurrent);
          saved = await repository.save(source.bank, selected.revision, {
            isCurrent,
          });
          if (!preview.connectable) {
            if (!config)
              notify(
                "inactive",
                "بازیابی انجام شد؛ ذخیرهٔ خودکار فایل فعال نیست.",
              );
            return;
          }
          assertCurrent(isCurrent);
          const verified = await readRestoreSource(selected.source);
          assertCurrent(isCurrent);
          if (!sameRestoreSource(selected, verified))
            throw Error(
              "فایل هنگام بازیابی تغییر کرده؛ ذخیرهٔ خودکار فعال نشد.",
            );
          const [bank, target] = await Promise.all([
            repository.read(),
            repository.readBackup(),
          ]);
          assertCurrent(isCurrent);
          if (
            bank.revision !== saved.revision ||
            contents(D.validate(bank)) !== contents(source.bank) ||
            (target?.id || null) !== selected.connectionId
          )
            throw Error(
              "اطلاعات یا اتصال هنگام بازیابی تغییر کرده؛ ذخیرهٔ خودکار فعال نشد.",
            );
          nextId = host.crypto.randomUUID();
          const next = {
            id: nextId,
            handle: selected.handle,
            hash: await hash(verified.text),
            counts: counts(bank),
            savedAt: "",
            suspended: "restore-source",
          };
          assertCurrent(isCurrent);
          if ((await repository.read()).revision !== saved.revision)
            throw Error(
              "بانک هنگام اتصال فایل تغییر کرده؛ ذخیرهٔ خودکار فعال نشد.",
            );
          assertCurrent(isCurrent);
          await repository.writeBackup(next, { isCurrent });
          config = next;
          attached = true;
          notify(
            permission === "granted" ? "paused" : "permission",
            "بازیابی انجام شد؛ برای فعال‌شدن ذخیرهٔ خودکار در همین فایل، «ذخیره اکنون» را بزنید.",
          );
        };
        if (host.navigator?.locks?.request) await locked(commit);
        else {
          if (await repository.readBackup())
            throw Error(
              "برای حفظ فایل قبلی، بازیابی را در مرورگر پشتیبانی‌شده انجام دهید.",
            );
          await commit();
        }
        if (attached && permission === "granted" && isCurrent()) {
          const active = await sync({
            approved: true,
            expectedId: nextId,
            expectedRevision: saved.revision,
            isCurrent,
          });
          if (active)
            return result(
              "بانک سؤال بازیابی شد؛ ذخیرهٔ خودکار در همین فایل فعال است.",
              true,
            );
        }
        if (attached && (await repository.readBackup())?.id !== nextId) {
          attached = false;
          return result(
            "بازیابی انجام شد؛ اتصال فایل تغییر کرده و ذخیرهٔ خودکار در فایل بازیابی‌شده فعال نیست. وضعیت ذخیره را بررسی کنید.",
          );
        }
        return result(
          attached
            ? "بازیابی انجام شد؛ ذخیرهٔ خودکار هنوز فعال نیست. برای تأیید مجوز و ذخیره در همین فایل، «ذخیره اکنون» را بزنید."
            : "بازیابی انجام شد؛ ذخیرهٔ خودکار فعال نیست. برای ادامه، فایل JSON را از «انتخاب فایل برای ذخیره» متصل کنید؛ فایل قبلی تغییر نکرد.",
        );
      } catch (error) {
        if (!saved) throw error;
        return result(
          "بازیابی انجام شد؛ ذخیرهٔ خودکار فعال نشد. فایل قبلی متوقف مانده است. " +
            (error.message || String(error)),
        );
      } finally {
        restoring = false;
      }
    }
    async function stop({ isCurrent = () => true } = {}) {
      if (!isCurrent()) return false;
      if (clearing || restoring)
        throw Error(
          "بازیابی یا پاک‌سازی بانک سؤال در حال انجام است؛ کمی صبر کنید.",
        );
      if (!supported()) return false;
      const expectedId = config?.id;
      return locked(async () => {
        try {
          if (!isCurrent()) return false;
          const current = await repository.readBackup();
          if (!isCurrent()) return false;
          if (current?.id !== expectedId)
            throw Error(
              "اتصال فایل تغییر کرده؛ ابتدا وضعیت را دوباره بررسی کنید.",
            );
          await repository.writeBackup(null, { isCurrent });
          config = null;
          host.clearTimeout(debounce);
          notify("inactive", "اتصال قطع شد؛ فایل موجود حذف نشده است.");
          return true;
        } catch (error) {
          if (isCancelled(error) || !isCurrent()) return false;
          throw error;
        }
      });
    }
    async function suspend() {
      if (!host.navigator?.locks?.request) {
        if (await repository.readBackup())
          throw Error(
            "برای حفظ فایل قبلی، بازیابی را در مرورگر پشتیبانی‌شده انجام دهید.",
          );
        return;
      }
      return locked(async () => {
        config = await repository.readBackup();
        if (config) {
          config = { ...config, suspended: "restore" };
          await repository.writeBackup(config);
          notify(
            "paused",
            "پس از بازیابی، فایل قبلی تغییر نمی‌کند؛ ادامه نیاز به تأیید شما دارد.",
          );
        }
      });
    }
    async function clear(
      expected,
      { isCurrent = () => true, deleteFile = false, expectedFileId } = {},
    ) {
      const cancelled = () =>
        Error("عملیات لغو شد؛ اطلاعات بانک سؤال تغییر نکرد.");
      if (!isCurrent()) throw cancelled();
      if (choosing || clearing || restoring)
        throw Error(
          "انتخاب فایل، بازیابی یا پاک‌سازی بانک سؤال در حال انجام است؛ پس از پایان آن دوباره تلاش کنید.",
        );
      clearing = true;
      let removed = false;
      try {
        const target = config;
        if (deleteFile && target) assertFileName(target.handle.name);
        if (deleteFile && target && target.handle.kind !== "file")
          throw Error("فقط فایل متصل بانک سؤال قابل حذف است.");
        if (deleteFile && target && typeof target.handle.remove !== "function")
          throw Error(
            "این مرورگر حذف مستقیم فایل متصل را پشتیبانی نمی‌کند؛ هیچ اطلاعاتی حذف نشد. فایل را از مدیریت فایل دستگاه حذف کنید؛ سپس اتصال را قطع کرده و حذف اطلاعات را دوباره انجام دهید.",
          );
        // Start the permission request in the explicit confirmation gesture.
        const permission =
          deleteFile && target
            ? await target.handle.requestPermission({ mode: "readwrite" })
            : null;
        // Initialization may have an existing file write in flight. Finish it
        // before taking the same cross-window lock used by every writer.
        if (initialized) await initialized;
        if (!isCurrent()) throw cancelled();
        const reset = async () => {
          if (!isCurrent()) throw cancelled();
          if (deleteFile) {
            const current = await repository.readBackup();
            if (
              (current?.id || null) !== (expectedFileId || null) ||
              (current?.id || null) !== (target?.id || null)
            )
              throw Error(
                "اتصال فایل پس از پیش‌نمایش تغییر کرده؛ هیچ اطلاعاتی حذف نشد.",
              );
            if ((await repository.read()).revision !== expected)
              throw Error(
                "بانک پس از پیش‌نمایش تغییر کرده؛ هیچ اطلاعاتی حذف نشد.",
              );
            if (current) {
              if (permission !== "granted")
                throw Error("مجوز حذف فایل داده نشد؛ اطلاعات بانک حفظ شد.");
              const inspected = await inspect(current.handle);
              if (inspected.hash !== current.hash)
                throw Error("فایل متصل بیرون از برنامه تغییر کرده؛ حذف نشد.");
              if ((await repository.read()).revision !== expected)
                throw Error("بانک هنگام بررسی فایل تغییر کرده؛ حذف نشد.");
              if (!isCurrent()) throw cancelled();
              await current.handle.remove();
              removed = true;
            }
          }
          let bank;
          try {
            bank = await repository.clear(expected, { isCurrent });
          } catch (error) {
            if (removed) {
              // Keep the connection suspended under the writer's lock. A file
              // removal cannot be rolled back with the IndexedDB transaction.
              config = { ...target, suspended: "file-deleted" };
              await repository.writeBackup(config).catch(() => {});
              notify(
                "error",
                "فایل متصل حذف شد، اما اطلاعات بانک کامل پاک نشد؛ اتصال را قطع و وضعیت اطلاعات را بررسی کنید.",
              );
            }
            throw error;
          }
          config = null;
          host.clearTimeout(debounce);
          notify(
            "inactive",
            removed
              ? "اطلاعات بانک سؤال و فایل متصل آن حذف شدند؛ اتصال خودکار قطع شد."
              : "اطلاعات بانک سؤال پاک شد و ذخیرهٔ خودکار قطع شد؛ فایل‌های دستگاه تغییر نکردند.",
          );
          return bank;
        };
        if (host.navigator?.locks?.request) return await locked(reset);
        // A previously connected file cannot be safely detached without the
        // lock which coordinates its other windows. Manual-only banks can clear.
        if (await repository.readBackup())
          throw Error(
            "برای حفظ فایل قبلی، پاک‌سازی بانک سؤال را در Chrome یا Edge انجام دهید.",
          );
        return await reset();
      } catch (error) {
        if (removed)
          throw Error(
            "فایل متصل حذف شد، اما پاک‌سازی اطلاعات بانک کامل نشد؛ اطلاعات باقی‌مانده را بررسی و دوباره تلاش کنید. " +
              error.message,
            { cause: error },
          );
        throw error;
      } finally {
        clearing = false;
      }
    }
    function subscribe(listener) {
      listeners.add(listener);
      listener({ ...status });
      return () => listeners.delete(listener);
    }
    function dispose() {
      host.clearInterval(timer);
      host.clearTimeout(debounce);
      listeners.clear();
    }
    return {
      supported,
      init,
      choose,
      sync,
      saveNow,
      stop,
      suspend,
      previewRestore,
      restore,
      clear,
      subscribe,
      schedule,
      dispose,
      suggestedName,
      state: () => ({ ...status }),
    };
  }
  root.EduQuestionBankFileBackup = { create: createFileBackup, assertFileName };
  if (root.EduQuestionBankRepository && typeof document !== "undefined") {
    const service = createFileBackup(root.EduQuestionBankRepository);
    root.EduQuestionBankFileBackup.service = service;
    root.addEventListener("edu-question-bank-saved", service.schedule);
    service.init().catch(() => {});
  }
})(globalThis);
