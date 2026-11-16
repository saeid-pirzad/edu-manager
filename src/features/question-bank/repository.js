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
  async function save(bank, expected) {
    const next = structuredClone(bank);
    next.revision = expected + 1;
    root.EduQuestionBank.validate(next);
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("bank", "readwrite"),
        store = tx.objectStore("bank"),
        r = store.get("current");
      let conflict = false;
      r.onsuccess = () => {
        if ((r.result?.revision || 0) !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put(next, "current");
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = () =>
        reject(
          conflict
            ? Error(
                "بانک در پنجره دیگری تغییر کرده است. بانک را ببندید و دوباره باز کنید؛ تغییرات شما ذخیره نشد.",
              )
            : tx.error ||
                Error("ذخیره بانک ناموفق بود؛ فضای دستگاه را بررسی کنید."),
        );
    });
  }
  root.EduQuestionBankRepository = { read, save };
})(globalThis);
