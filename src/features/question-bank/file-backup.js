(function (root) {
  "use strict";
  function assertFileName(name) {
    if (
      typeof name !== "string" ||
      !/^Classyar-QuestionBank(?: ?\([1-9]\d*\))?\.json$/.test(name)
    )
      throw Error(
        "نام فایل بانک سؤال باید Classyar-QuestionBank.json یا نسخهٔ شماره‌دار آن مانند Classyar-QuestionBank(1).json باشد. فایل‌های قدیمی را ابتدا تغییر نام دهید؛ محتوای آن‌ها نیز بررسی می‌شود.",
      );
  }
  // File handles stay device-local; they never enter the exported bank JSON.
  function createFileBackup(repository, host = root) {
    const D = root.EduQuestionBank;
    let config = null,
      initialized,
      timer,
      debounce,
      choosing = false;
    const listeners = new Set();
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
    }
    const locked = (action) =>
      host.navigator.locks.request("ClassyarQuestionBank.file", action);
    const counts = (bank) =>
      Object.fromEntries(
        ["courses", "units", "questions", "exams"].map((key) => [
          key,
          bank[key].length,
        ]),
      );
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
        `${error.message || error} فایل به‌روز نشد؛ پشتیبان دستی بگیرید.`,
      );
      return false;
    }
    async function write(handle, json, expectedHash, allowEmpty = false) {
      let stream;
      try {
        // Source reads and serialization can yield after the earlier inspection.
        // Recheck the destination before opening a stream that could replace it.
        const before = await inspect(handle, allowEmpty);
        if (before.hash !== expectedHash)
          throw Error("فایل پیش از نوشتن تغییر کرد؛ بازنویسی نشد.");
        stream = await handle.createWritable();
        await stream.write(json);
        await stream.close();
        stream = null;
        const verified = await inspect(handle);
        if (verified.text !== json)
          throw Error("محتوای فایل پس از نوشتن تأیید نشد.");
        return verified.hash;
      } catch (error) {
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
    } = {}) {
      if (!supported()) return false;
      return locked(async () => {
        try {
          config = await repository.readBackup();
          if (!config) {
            notify("inactive", "ذخیرهٔ خودکار فایل فعال نیست.");
            return false;
          }
          if (expectedId && config.id !== expectedId)
            throw Error("اتصال فایل تغییر کرد؛ نوشته نشد.");
          if (
            (await config.handle.queryPermission({ mode: "readwrite" })) !==
            "granted"
          ) {
            notify("permission", "مجوز فایل نیاز به تأیید دارد.");
            return false;
          }
          if (config.suspended && !approved) {
            notify(
              "paused",
              "نوشتن فایل برای حفظ نسخهٔ قبلی متوقف است؛ نسخهٔ قبلی را نگه دارید و برای ادامه «ذخیره اکنون» را بزنید.",
            );
            return false;
          }
          const current = await inspect(config.handle);
          if (current.hash !== config.hash)
            throw Error(
              "فایل بیرون از این اتصال تغییر کرده؛ فایل تازه‌ای انتخاب کنید.",
            );
          const bank = D.validate(await repository.read());
          if (approved && bank.revision !== expectedRevision)
            throw Error("اطلاعات پس از تأیید تغییر کرد؛ دوباره بررسی کنید.");
          const baseline = counts(bank);
          if (
            !approved &&
            (dropped(config.counts, baseline) ||
              dropped(counts(current.bank), baseline))
          ) {
            config = { ...config, suspended: "source-drop" };
            await repository.writeBackup(config);
            notify(
              "paused",
              "کاهش شدید اطلاعات شناسایی شد؛ برای حفظ نسخهٔ قبلی، فایل تغییر نکرد. ادامه فقط با تأیید شماست.",
            );
            return false;
          }
          const json = D.size(bank);
          if (current.text === json) {
            if (config.suspended) {
              delete config.suspended;
              await repository.writeBackup(config);
            }
            active();
            return true;
          }
          notify("busy", "در حال ذخیره و بررسی فایل بانک سؤال…");
          const fingerprint = await write(config.handle, json, current.hash);
          config = {
            ...config,
            hash: fingerprint,
            counts: baseline,
            savedAt: new Date().toISOString(),
          };
          delete config.suspended;
          await repository.writeBackup(config);
          active();
          return true;
        } catch (error) {
          return failed(error);
        }
      });
    }
    function schedule() {
      if (!supported()) return;
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
    async function choose() {
      if (choosing || !supported()) return false;
      choosing = true;
      try {
        // Invoke the picker before awaiting storage, preserving the click gesture.
        const handle = await host.showSaveFilePicker({
          suggestedName: suggestedName(),
          excludeAcceptAllOption: true,
          types: [
            {
              description: "Question bank JSON",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        if (handle.kind !== "file" || !/\.json$/i.test(handle.name))
          throw Error("فقط فایل JSON بانک سؤال انتخاب کنید.");
        return await locked(async () => {
          config = await repository.readBackup();
          const before = await inspect(handle, true);
          const bank = D.validate(await repository.read());
          const json = D.size(bank);
          // Never silently replace a populated, different backup during selection.
          if (before.bank && D.size(before.bank) !== json)
            throw Error(
              "برای حفظ محتوای این فایل، فایل تازه‌ای بسازید؛ اگر قصد بازیابی دارید از بخش بازیابی استفاده کنید.",
            );
          const rechecked = await inspect(handle, true);
          if (rechecked.hash !== before.hash)
            throw Error("فایل هنگام انتخاب تغییر کرد؛ نوشته نشد.");
          notify("busy", "در حال اولین ذخیره و بررسی فایل…");
          const fingerprint = await write(handle, json, rechecked.hash, true);
          const next = {
            id: host.crypto.randomUUID(),
            handle,
            hash: fingerprint,
            counts: counts(bank),
            savedAt: new Date().toISOString(),
          };
          await repository.writeBackup(next);
          config = next;
          active();
          return true;
        });
      } catch (error) {
        return error.name === "AbortError" ? false : failed(error);
      } finally {
        choosing = false;
      }
    }
    async function saveNow(approve = () => false) {
      if (!supported() || !config) return false;
      const target = config;
      try {
        // Permission must also be requested directly in the user's click.
        if (
          (await target.handle.requestPermission({ mode: "readwrite" })) !==
          "granted"
        ) {
          notify("permission", "اجازهٔ نوشتن داده نشد؛ فایل تغییر نکرد.");
          return false;
        }
        if (await sync({ expectedId: target.id })) return true;
        if (status.state !== "paused") return false;
        const preview = D.validate(await repository.read());
        const accepted = await approve(target.handle.name, counts(preview));
        if (!accepted) return false;
        const current = await repository.readBackup();
        if (current?.id !== target.id)
          throw Error("اتصال فایل تغییر کرده است؛ دوباره بررسی کنید.");
        return sync({
          approved: true,
          expectedId: target.id,
          expectedRevision: preview.revision,
        });
      } catch (error) {
        return failed(error);
      }
    }
    async function stop() {
      if (!supported()) return false;
      const expectedId = config?.id;
      return locked(async () => {
        const current = await repository.readBackup();
        if (current?.id !== expectedId)
          throw Error(
            "اتصال فایل تغییر کرده؛ ابتدا وضعیت را دوباره بررسی کنید.",
          );
        await repository.writeBackup(null);
        config = null;
        host.clearTimeout(debounce);
        notify("inactive", "اتصال قطع شد؛ فایل موجود حذف نشده است.");
        return true;
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
