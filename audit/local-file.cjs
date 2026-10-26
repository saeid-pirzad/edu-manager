"use strict";
const path = require("node:path");
const { pathToFileURL } = require("node:url");
module.exports = async function localFile({ cdp, evaluate, root, delay }) {
  const original = await evaluate("location.href");
  let results, restored;
  const ready = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if (await evaluate("!!globalThis.EduV24?.test?.getState().ready"))
          return true;
      } catch {
        /* Navigation can replace the execution context. */
      }
      await delay(100);
    }
    return false;
  };
  try {
    await cdp("Page.navigate", {
      url: pathToFileURL(path.join(root, "EduManager.html")).href,
    });
    await delay(300);
    const started = await ready();
    results = [
      {
        id: "FILE01",
        name: "local HTML loads external scripts and starts under CSP in an isolated profile",
        pass: started,
        observed: { protocol: await evaluate("location.protocol") },
      },
    ];
  } finally {
    await cdp("Page.navigate", { url: original });
    await delay(300);
    restored = await ready();
  }
  if (!restored)
    throw Error(
      "Application failed to recover after local-file compatibility test",
    );
  return results;
};
