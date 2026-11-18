(function (root) {
  "use strict";
  let connection;
  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open("ClassyarQuestionBank", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("bank");
      request.onerror = () => {
        connection = null;
        reject(request.error);
      };
      request.onblocked = () => {
        connection = null;
        reject(Error("برای به‌روزرسانی بانک پنجره‌های دیگر را ببندید."));
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        resolve(db);
      };
    });
    return connection;
  }
  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("bank", "readonly");
      const r = tx.objectStore("bank").get("current");
      tx.oncomplete = () => resolve(r.result || root.EduQuestionBank.empty());
      tx.onabort = () => reject(tx.error || Error("خواندن بانک ناموفق بود."));
    });
  }
  async function writeBank(
    bank,
    expected,
    { isCurrent = () => true } = {},
    detachBackup = false,
  ) {
    const cancelled = () =>
      Error("عملیات لغو شد؛ بخش پشتیبان دیگر فعال نیست. اطلاعات تغییر نکرد.");
    if (!isCurrent()) throw cancelled();
    const next = structuredClone(bank);
    next.revision = expected + 1;
    root.EduQuestionBank.validate(next);
    const db = await open();
    if (!isCurrent()) throw cancelled();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("bank", "readwrite"),
        store = tx.objectStore("bank"),
        r = store.get("current");
      let conflict = false,
        invalidated = false;
      r.onsuccess = () => {
        if (!isCurrent()) {
          invalidated = true;
          tx.abort();
          return;
        }
        if ((r.result?.revision || 0) !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put(next, "current");
        // Keep the new empty bank and detaching its file connection atomic.
        // A monotonically increasing revision also invalidates stale editors.
        if (detachBackup) store.delete("file-backup");
      };
      tx.oncomplete = () => {
        resolve(next);
        root.dispatchEvent?.(new Event("edu-question-bank-saved"));
      };
      tx.onabort = () =>
        reject(
          invalidated
            ? cancelled()
            : conflict
              ? Error(
                  "بانک در پنجره دیگری تغییر کرده است. بانک را ببندید و دوباره باز کنید؛ تغییرات شما ذخیره نشد.",
                )
              : tx.error ||
                Error("ذخیره بانک ناموفق بود؛ فضای دستگاه را بررسی کنید."),
        );
    });
  }
  function save(bank, expected, options) {
    return writeBank(bank, expected, options);
  }
  function clear(expected, options) {
    return writeBank(root.EduQuestionBank.empty(), expected, options, true);
  }
  async function readBackup() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("bank", "readonly");
      const request = tx.objectStore("bank").get("file-backup");
      tx.oncomplete = () => resolve(request.result || null);
      tx.onabort = () =>
        reject(tx.error || Error("خواندن اتصال فایل ناموفق بود."));
    });
  }
  async function writeBackup(config, { isCurrent = () => true } = {}) {
    const cancelled = () =>
      Error("عملیات لغو شد؛ بخش پشتیبان دیگر فعال نیست. اتصال تغییر نکرد.");
    if (!isCurrent()) throw cancelled();
    const db = await open();
    if (!isCurrent()) throw cancelled();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("bank", "readwrite"),
        store = tx.objectStore("bank"),
        request = store.get("file-backup");
      let invalidated = false;
      // A readwrite transaction can wait behind another window's writer.
      // Check its owner when the first request actually executes, before
      // queueing a connection change in that transaction.
      request.onsuccess = () => {
        if (!isCurrent()) {
          invalidated = true;
          tx.abort();
          return;
        }
        if (config) store.put(config, "file-backup");
        else store.delete("file-backup");
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          invalidated
            ? cancelled()
            : tx.error || Error("ثبت اتصال فایل ناموفق بود."),
        );
    });
  }
  root.EduQuestionBankRepository = {
    read,
    save,
    clear,
    readBackup,
    writeBackup,
  };
})(globalThis);
