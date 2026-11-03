"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const code = fs.readFileSync(
  path.join(__dirname, "../service-worker.js"),
  "utf8",
);
function fixture({ failure = null, incomplete = false } = {}) {
  const handlers = new Map(),
    stores = new Map(),
    network = [],
    effects = [];
  const current = new Map();
  const context = vm.createContext({
    URL,
    Request,
    Response,
    self: {
      location: { href: "https://example.test/edu-manager/service-worker.js" },
      addEventListener: (type, callback) => handlers.set(type, callback),
      clients: { claim: async () => effects.push("claim") },
    },
    fetch: async (request) => {
      network.push(request.url);
      if (failure && request.url.endsWith(failure))
        throw Error("network failure");
      return new Response("network:" + request.url);
    },
    caches: {
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
      open: async (name) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const records = stores.get(name);
        return {
          put: async (request, response) =>
            records.set(
              typeof request === "string" ? request : request.url,
              response.clone(),
            ),
          match: async (request) =>
            records
              .get(typeof request === "string" ? request : request.url)
              ?.clone(),
        };
      },
    },
  });
  vm.runInContext(code, context);
  const constants = vm.runInContext(
    "({ CACHE, STAGING, PREFIX, URLS, APP })",
    context,
  );
  stores.set(constants.PREFIX + "old-release", current);
  stores.set("unrelated-application", new Map());
  if (incomplete) stores.set(constants.STAGING, new Map());
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
  return { stores, current, network, effects, constants, dispatch };
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

test("activation promotes all assets before removing only obsolete same-scope caches", async () => {
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
  for (const url of f.constants.URLS)
    assert.equal(await active.get(url).clone().text(), "network:" + url);
  let status;
  await f.dispatch("message", {
    data: { type: "OFFLINE_STATUS" },
    ports: [
      {
        postMessage: (value) => {
          status = value;
        },
      },
    ],
  });
  assert.equal(status.ready, true);
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
  await f.dispatch("install");
  await f.dispatch("activate");
  f.network.length = 0;
  for (const suffix of ["", "index.html", "EduManager.html?report=daily"]) {
    const response = await f.dispatch("fetch", {
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://example.test/edu-manager/" + suffix,
      },
    });
    assert.equal(await response.text(), "network:" + f.constants.APP);
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
  ])
    assert.equal(f.dispatch("fetch", { request }), undefined);
});
