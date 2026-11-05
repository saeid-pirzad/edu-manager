"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  { createHash, webcrypto } = require("node:crypto");
const { contentType } = require("../scripts/application-files.cjs");
const code = fs.readFileSync(
  path.join(__dirname, "../service-worker.js"),
  "utf8",
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(options = {}) {
  const handlers = new Map(),
    stores = new Map(),
    network = [],
    effects = [],
    timers = new Map(),
    files = new Map([
      ["EduManager.html", "<!doctype html>\n<title>Classroom</title>\n"],
      ["index.html", "<!doctype html>\n<meta name=app>\n"],
      ["app.webmanifest", '{"name":"Classroom"}\n'],
      ["assets/scripts/first.js", '"use strict";\nglobalThis.first = 1;\n'],
      ["assets/scripts/second.js", '"use strict";\nglobalThis.second = 2;\n'],
      ["assets/scripts/identity.js", "globalThis.identity = {};\n"],
      ["assets/styles/app.css", "body { color: black; }\n"],
      ...(options.binary
        ? [
            [
              "assets/logo.png",
              Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255, 0]),
            ],
          ]
        : []),
    ]);
  const integrity = Object.fromEntries(
    [...files].map(([name, body]) => [
      name,
      [
        createHash("sha256").update(body).digest("hex"),
        contentType(name).split(";")[0],
      ],
    ]),
  );
  let concurrent = 0,
    maximum = 0,
    timerSequence = 0;
  const current = new Map();
  const context = vm.createContext({
    URL,
    Request,
    Response,
    TextEncoder,
    AbortController,
    setTimeout: (callback, delay) => {
      const id = ++timerSequence;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    crypto: webcrypto,
    self: {
      location: { href: "https://example.test/edu-manager/service-worker.js" },
      addEventListener: (type, callback) => handlers.set(type, callback),
      clients: { claim: async () => effects.push("claim") },
    },
    fetch: async (request) => {
      network.push(request.url);
      concurrent++;
      maximum = Math.max(maximum, concurrent);
      try {
        await options.beforeFetch?.(request);
        if (options.failure && request.url.endsWith(options.failure))
          throw Error("network failure");
        const name = new URL(request.url).pathname.replace(
          /^\/edu-manager\//,
          "",
        );
        assert.ok(
          files.has(name),
          "only fixture runtime assets may be fetched",
        );
        const response = new Response(files.get(name), {
          headers: { "Content-Type": contentType(name) },
        });
        return options.rewrite?.(response, name) ?? response;
      } finally {
        concurrent--;
      }
    },
    caches: {
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
      open: async (name) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const records = stores.get(name);
        return {
          put: async (request, response) => {
            if (options.putFailure?.(name, request))
              throw Error("quota exceeded");
            records.set(
              typeof request === "string" ? request : request.url,
              response.clone(),
            );
          },
          match: async (request) =>
            records
              .get(typeof request === "string" ? request : request.url)
              ?.clone(),
        };
      },
    },
  });
  vm.runInContext(
    code
      .replace(
        /const FILES\s*=\s*\[[\s\S]*?\];/,
        "const FILES = " + JSON.stringify([...files.keys()]) + ";",
      )
      .replace(
        /const INTEGRITY\s*=\s*\{[\s\S]*?\};/,
        "const INTEGRITY = " + JSON.stringify(integrity) + ";",
      ),
    context,
  );
  const constants = vm.runInContext(
    "({ CACHE, STAGING, PREFIX, URLS, APP })",
    context,
  );
  stores.set(constants.PREFIX + "old-release", current);
  stores.set("unrelated-application", new Map());
  if (options.incomplete) stores.set(constants.STAGING, new Map());
  const dispatch = (type, extra = {}) => {
    let completion;
    handlers.get(type)({
      ...extra,
      waitUntil: (promise) => {
        completion = promise;
      },
      respondWith: (promise) => {
        completion = promise;
      },
    });
    return completion;
  };
  const status = async () => {
    let value;
    await dispatch("message", {
      data: { type: "OFFLINE_STATUS" },
      ports: [
        {
          postMessage: (message) => {
            value = message;
          },
        },
      ],
    });
    return value;
  };
  const request = (name, mode = "cors") =>
    dispatch("fetch", {
      request: {
        method: "GET",
        mode,
        url: new URL(name, "https://example.test/edu-manager/").href,
      },
    });
  const activate = async () => {
    await dispatch("install");
    await dispatch("activate");
    network.length = 0;
    maximum = 0;
  };
  return {
    stores,
    current,
    timers,
    network,
    effects,
    constants,
    dispatch,
    status,
    request,
    activate,
    files,
    options,
    maximum: () => maximum,
  };
}

test("offline installation failure deletes only its incomplete staging cache", async () => {
  const f = fixture({ failure: "app.webmanifest" });
  await assert.rejects(f.dispatch("install"), /network failure/);
  assert.ok(f.network.length > 1);
  assert.equal(f.stores.has(f.constants.STAGING), false);
  assert.equal(f.stores.has(f.constants.CACHE), false);
  assert.equal(f.stores.has(f.constants.PREFIX + "old-release"), true);
  assert.equal(f.stores.has("unrelated-application"), true);
  assert.deepEqual(f.effects, []);
});

test("activation promotes verified assets before removing only obsolete same-scope caches", async () => {
  const f = fixture();
  await f.dispatch("install");
  assert.equal(f.stores.has(f.constants.CACHE), false);
  await f.dispatch("activate");
  assert.deepEqual(f.effects, ["claim"]);
  assert.equal(f.stores.has(f.constants.STAGING), false);
  assert.equal(f.stores.has(f.constants.PREFIX + "old-release"), false);
  assert.equal(f.stores.has("unrelated-application"), true);
  const active = f.stores.get(f.constants.CACHE);
  assert.equal(active.size, f.constants.URLS.length);
  for (const [name, body] of f.files)
    assert.equal(
      await active.get(new URL(name, f.constants.APP).href).clone().text(),
      body,
    );
  assert.equal((await f.status()).ready, true);
});

test("incomplete activation retains the previous release and never claims its clients", async () => {
  const f = fixture({ incomplete: true });
  await assert.rejects(f.dispatch("activate"), /incomplete/);
  assert.equal(f.stores.has(f.constants.PREFIX + "old-release"), true);
  assert.equal(f.stores.has(f.constants.CACHE), false);
  assert.deepEqual(f.effects, []);
});

test("offline navigation to root, index and query URLs serves the complete app shell", async () => {
  const f = fixture();
  await f.activate();
  for (const suffix of ["", "index.html", "EduManager.html?report=daily"]) {
    const response = await f.request(suffix, "navigate");
    assert.equal(await response.text(), f.files.get("EduManager.html"));
  }
  assert.deepEqual(f.network, []);
});

test("worker leaves writes, foreign origins and unrelated paths to the browser", () => {
  const f = fixture();
  for (const request of [
    { method: "POST", mode: "cors", url: f.constants.APP },
    {
      method: "GET",
      mode: "navigate",
      url: "https://another.test/edu-manager/EduManager.html",
    },
    {
      method: "GET",
      mode: "navigate",
      url: "https://example.test/another-app/",
    },
    {
      method: "GET",
      mode: "cors",
      url: "https://example.test/edu-manager/assets/scripts/first.js.map",
    },
  ])
    assert.equal(f.dispatch("fetch", { request }), undefined);
});

test("HTML masquerading as a successful JavaScript download rejects installation", async () => {
  const f = fixture({
    rewrite: (response, name) =>
      name.endsWith("first.js")
        ? new Response("<!doctype html><title>Maintenance</title>", {
            headers: { "Content-Type": "text/html" },
          })
        : response,
  });
  await assert.rejects(f.dispatch("install"), /content type/);
  assert.equal(f.stores.has(f.constants.STAGING), false);
  assert.equal(f.stores.has(f.constants.PREFIX + "old-release"), true);
});

test("correct MIME with bytes from another release cannot enter an installed cache", async () => {
  const f = fixture({
    rewrite: (response, name) =>
      name.endsWith("first.js")
        ? new Response("globalThis.first = 'new release';", {
            headers: { "Content-Type": "application/javascript" },
          })
        : response,
  });
  await assert.rejects(f.dispatch("install"), /does not match this release/);
  assert.equal(f.stores.has(f.constants.CACHE), false);
  assert.equal(f.stores.has(f.constants.STAGING), false);
  assert.equal(f.stores.has(f.constants.PREFIX + "old-release"), true);
});

test("standard JavaScript MIME aliases and equivalent CRLF text remain installable", async () => {
  const f = fixture({
    rewrite: (response, name) =>
      new Response(f.files.get(name).replace(/\n/g, "\r\n"), {
        headers: {
          "Content-Type": name.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : contentType(name),
        },
      }),
  });
  await f.activate();
  assert.equal((await f.status()).ready, true);
});

test("binary PNG dependencies install byte-for-byte and remain available offline", async () => {
  const f = fixture({ binary: true });
  await f.activate();
  const response = await f.request("assets/logo.png");
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    f.files.get("assets/logo.png"),
  );
  assert.deepEqual(f.network, []);
  assert.equal((await f.status()).ready, true);
});

test("PNG text decoding or newline rewriting cannot pass binary integrity", async () => {
  for (const corrupt of [
    (bytes) => Buffer.from(bytes.toString("utf8")),
    (bytes) =>
      Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1"),
  ]) {
    const f = fixture({
      binary: true,
      rewrite: (response, name) =>
        name === "assets/logo.png"
          ? new Response(corrupt(f.files.get(name)), {
              headers: { "Content-Type": "image/png" },
            })
          : response,
    });
    await assert.rejects(f.dispatch("install"), /does not match this release/);
    assert.equal(f.stores.has(f.constants.CACHE), false);
    assert.equal(f.stores.has(f.constants.STAGING), false);
    assert.equal(f.stores.has(f.constants.PREFIX + "old-release"), true);
  }
});

test("HTML returned for a PNG URL cannot become an offline icon", async () => {
  const f = fixture({
    binary: true,
    rewrite: (response, name) =>
      name === "assets/logo.png"
        ? new Response("<!doctype html><title>Missing image</title>", {
            headers: { "Content-Type": "text/html" },
          })
        : response,
  });
  await assert.rejects(f.dispatch("install"), /content type/);
  assert.equal(f.stores.has(f.constants.STAGING), false);
  assert.equal(f.stores.has(f.constants.PREFIX + "old-release"), true);
});

test("an evicted binary icon repairs only from its exact release bytes", async () => {
  const f = fixture({ binary: true });
  await f.activate();
  const icon = new URL("assets/logo.png", f.constants.APP).href;
  const active = f.stores.get(f.constants.CACHE);
  active.delete(icon);
  const response = await f.request("assets/logo.png");
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    f.files.get("assets/logo.png"),
  );
  assert.equal(active.has(icon), true);
  f.options.failure = "assets/logo.png";
  const offline = await f.request("assets/logo.png");
  assert.deepEqual(
    Buffer.from(await offline.arrayBuffer()),
    f.files.get("assets/logo.png"),
  );
});

test("downloads overlap within a bounded four-request pool", async () => {
  const f = fixture({ beforeFetch: tick });
  await f.dispatch("install");
  assert.equal(f.network.length, f.files.size);
  assert.equal(f.maximum(), 4);
});

test("failed concurrent installation settles its in-flight work before staging cleanup", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({
    beforeFetch: async (request) => {
      if (request.url.endsWith("app.webmanifest")) throw Error("early failure");
      await gate;
    },
  });
  const installing = f.dispatch("install");
  await tick();
  assert.equal(f.stores.has(f.constants.STAGING), true);
  assert.equal(f.network.length, 4);
  release();
  await assert.rejects(installing, /early failure/);
  assert.equal(f.stores.has(f.constants.STAGING), false);
  await tick();
  assert.equal(f.stores.has(f.constants.STAGING), false);
  assert.equal(f.network.length, 4, "no new download starts after the failure");
});

test("a damaged staged response cannot replace the previous active release", async () => {
  const f = fixture();
  await f.dispatch("install");
  f.stores.get(f.constants.STAGING).set(
    f.constants.APP,
    new Response("wrong HTML", {
      headers: { "Content-Type": "text/html" },
    }),
  );
  await assert.rejects(f.dispatch("activate"), /does not match this release/);
  assert.equal(f.stores.has(f.constants.PREFIX + "old-release"), true);
  assert.equal(f.stores.has(f.constants.CACHE), false);
  assert.deepEqual(f.effects, []);
});

test("an online cache miss repairs only matching version bytes and then works offline", async () => {
  const f = fixture();
  await f.activate();
  const css = new URL("assets/styles/app.css", f.constants.APP).href;
  const active = f.stores.get(f.constants.CACHE);
  active.delete(css);
  assert.equal(active.has(css), false);
  assert.equal(
    await (await f.request("assets/styles/app.css")).text(),
    f.files.get("assets/styles/app.css"),
  );
  assert.equal(active.has(css), true);
  assert.equal((await f.status()).ready, true);
  f.options.failure = "app.css";
  assert.equal(
    await (await f.request("assets/styles/app.css")).text(),
    f.files.get("assets/styles/app.css"),
  );
  assert.deepEqual(f.network, [css]);
});

for (const mismatch of ["hash", "mime"])
  test(
    "cache-miss repair rejects " +
      mismatch +
      " mismatches without storing mixed release content",
    async () => {
      const f = fixture();
      await f.activate();
      const css = new URL("assets/styles/app.css", f.constants.APP).href;
      const active = f.stores.get(f.constants.CACHE);
      active.delete(css);
      f.options.rewrite = (response, name) =>
        name.endsWith("app.css")
          ? new Response(
              mismatch === "hash"
                ? "body{color:red}"
                : "<html>maintenance</html>",
              {
                headers: {
                  "Content-Type":
                    mismatch === "hash" ? "text/css" : "text/html",
                },
              },
            )
          : response;
      await assert.rejects(
        f.request("assets/styles/app.css"),
        mismatch === "hash" ? /does not match/ : /content type/,
      );
      assert.equal(active.has(css), false);
      assert.equal(active.size, f.files.size - 1);
      assert.equal((await f.status()).ready, false);
    },
  );

test("concurrent requests for the same missing asset share one verified repair", async () => {
  const f = fixture();
  await f.activate();
  const css = new URL("assets/styles/app.css", f.constants.APP).href;
  f.stores.get(f.constants.CACHE).delete(css);
  f.options.beforeFetch = tick;
  const responses = await Promise.all([
    f.request("assets/styles/app.css"),
    f.request("assets/styles/app.css"),
  ]);
  assert.deepEqual(f.network, [css]);
  for (const response of responses)
    assert.equal(await response.text(), f.files.get("assets/styles/app.css"));
  assert.equal((await f.status()).ready, true);
});

test("a missing navigation shell is repaired from its canonical URL, never query-specific HTML", async () => {
  const f = fixture();
  await f.activate();
  f.stores.get(f.constants.CACHE).delete(f.constants.APP);
  assert.equal(
    await (await f.request("index.html?report=daily", "navigate")).text(),
    f.files.get("EduManager.html"),
  );
  assert.deepEqual(f.network, [f.constants.APP]);
  assert.equal((await f.status()).ready, true);
});

test("a repair storage failure still permits verified online use without claiming offline readiness", async () => {
  const f = fixture();
  await f.activate();
  const css = new URL("assets/styles/app.css", f.constants.APP).href;
  f.stores.get(f.constants.CACHE).delete(css);
  f.options.putFailure = (name) => name === f.constants.CACHE;
  assert.equal(
    await (await f.request("assets/styles/app.css")).text(),
    f.files.get("assets/styles/app.css"),
  );
  assert.equal(f.stores.get(f.constants.CACHE).has(css), false);
  assert.equal((await f.status()).ready, false);
});

test("offline readiness repairs only missing index and manifest files while preserving the working cached shell", async () => {
  const f = fixture();
  await f.activate();
  const active = f.stores.get(f.constants.CACHE);
  const missing = ["index.html", "app.webmanifest"].map(
    (name) => new URL(name, f.constants.APP).href,
  );
  const app = await active.get(f.constants.APP).clone().text();
  for (const url of missing) active.delete(url);
  assert.equal((await f.status()).ready, true);
  assert.deepEqual([...f.network].sort(), [...missing].sort());
  assert.equal(active.size, f.files.size);
  assert.equal(await active.get(f.constants.APP).clone().text(), app);
  f.network.length = 0;
  assert.equal((await f.status()).ready, true);
  assert.equal((await f.status()).ready, true);
  assert.deepEqual(
    f.network,
    [],
    "a complete cache must not generate status network traffic",
  );
});

test("failed offline readiness repair stays false and can retry without replacing cached files", async () => {
  const f = fixture();
  await f.activate();
  const index = new URL("index.html", f.constants.APP).href;
  const active = f.stores.get(f.constants.CACHE);
  active.delete(index);
  f.options.failure = "index.html";
  assert.equal((await f.status()).ready, false);
  assert.equal(active.has(index), false);
  assert.equal(
    await (await f.request("EduManager.html", "navigate")).text(),
    f.files.get("EduManager.html"),
  );
  f.options.failure = null;
  assert.equal((await f.status()).ready, true);
  assert.equal(active.has(index), true);
  assert.deepEqual(f.network, [index, index]);
});

for (const mismatch of ["hash", "mime"])
  test(
    "offline readiness never accepts " +
      mismatch +
      " mismatch while repairing a missing manifest",
    async () => {
      const f = fixture();
      await f.activate();
      const manifest = new URL("app.webmanifest", f.constants.APP).href;
      const active = f.stores.get(f.constants.CACHE);
      active.delete(manifest);
      f.options.rewrite = (response, name) =>
        name === "app.webmanifest"
          ? new Response('{"name":"Another release"}', {
              headers: {
                "Content-Type":
                  mismatch === "hash"
                    ? "application/manifest+json"
                    : "text/html",
              },
            })
          : response;
      assert.equal((await f.status()).ready, false);
      assert.equal(active.has(manifest), false);
      assert.equal(active.size, f.files.size - 1);
      assert.equal(
        await active.get(f.constants.APP).clone().text(),
        f.files.get("EduManager.html"),
      );
    },
  );

test("readiness rechecks persisted entries when a verified repair cannot be stored", async () => {
  const f = fixture();
  await f.activate();
  const index = new URL("index.html", f.constants.APP).href;
  f.stores.get(f.constants.CACHE).delete(index);
  f.options.putFailure = (name) => name === f.constants.CACHE;
  assert.equal((await f.status()).ready, false);
  assert.deepEqual(f.network, [index]);
  assert.equal(f.stores.get(f.constants.CACHE).has(index), false);
});

test("concurrent readiness requests and fetch misses share repairs within a global four-request bound", async () => {
  const f = fixture();
  await f.activate();
  f.stores.get(f.constants.CACHE).clear();
  f.options.beforeFetch = tick;
  const [first, second, a, b] = await Promise.all([
    f.status(),
    f.status(),
    f.request("assets/scripts/first.js"),
    f.request("assets/scripts/second.js"),
  ]);
  assert.equal(first.ready, true);
  assert.equal(second.ready, true);
  assert.equal(f.network.length, f.files.size);
  assert.equal(new Set(f.network).size, f.files.size);
  assert.equal(f.maximum(), 4);
  assert.equal(await a.text(), f.files.get("assets/scripts/first.js"));
  assert.equal(await b.text(), f.files.get("assets/scripts/second.js"));
});

test("a stalled repair aborts within its deadline, replies not ready and releases its retry slot", async () => {
  const f = fixture();
  await f.activate();
  const index = new URL("index.html", f.constants.APP).href;
  f.stores.get(f.constants.CACHE).delete(index);
  let aborted = false;
  f.options.beforeFetch = (request) =>
    new Promise((_, reject) => {
      request.signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(Error("aborted"));
        },
        { once: true },
      );
    });
  const checking = f.status();
  await tick();
  const timer = [...f.timers.values()].find((value) => value.delay === 8000);
  assert.ok(timer, "repair has a finite deadline");
  timer.callback();
  assert.equal((await checking).ready, false);
  assert.equal(aborted, true);
  assert.equal(f.stores.get(f.constants.CACHE).has(index), false);
  f.options.beforeFetch = null;
  assert.equal((await f.status()).ready, true);
});

test("the repair deadline also covers a stalled response body and never writes its late result", async () => {
  const f = fixture();
  await f.activate();
  const index = new URL("index.html", f.constants.APP).href;
  const active = f.stores.get(f.constants.CACHE);
  active.delete(index);
  let body;
  f.options.rewrite = (response, name) =>
    name === "index.html"
      ? new Response(
          new ReadableStream({
            start(controller) {
              body = controller;
            },
          }),
          { headers: { "Content-Type": "text/html" } },
        )
      : response;
  const checking = f.status();
  await tick();
  assert.ok(body);
  const timer = [...f.timers.values()].find((value) => value.delay === 8000);
  assert.ok(timer);
  timer.callback();
  assert.equal((await checking).ready, false);
  body.close();
  await tick();
  assert.equal(active.has(index), false);
  f.options.rewrite = null;
  assert.equal((await f.status()).ready, true);
});
