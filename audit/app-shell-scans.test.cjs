"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../src/ui/app-shell.js"),
  "utf8",
);

function fixture() {
  const queries = [],
    frames = [],
    elements = new Map(),
    listeners = new Map();
  class Element {
    constructor(tag, id = "") {
      this.tagName = tag.toUpperCase();
      this.nodeType = 1;
      this.id = id;
      this.dataset = {};
      this.children = [];
      this.attributes = new Map();
      this.parentElement = null;
      this.isConnected = true;
      this.classList = {
        contains: (name) => name === "hidden",
      };
    }
    append(child) {
      this.children.push(child);
      child.parentElement = this;
      if (child.id) elements.set(child.id, child);
    }
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }
    querySelector() {
      return null;
    }
    querySelectorAll(selector) {
      queries.push({ root: this.id || this.tagName, selector });
      return [];
    }
    closest(selector) {
      const ids = selector.split(",").map((part) => part.slice(1));
      for (let target = this; target; target = target.parentElement)
        if (ids.includes(target.id)) return target;
      return null;
    }
  }
  const body = new Element("body", "body"),
    document = {
      body,
      readyState: "complete",
      documentElement: {
        dataset: {},
        style: { setProperty() {} },
      },
      getElementById: (id) => elements.get(id) || null,
      createElement: (tag) => new Element(tag),
      querySelector: () => null,
      querySelectorAll(selector) {
        queries.push({ root: "document", selector });
        return [];
      },
      addEventListener(name, handler) {
        listeners.set(name, handler);
      },
    };
  for (const id of ["app", "modal", "calPopup", "mobileBar", "pwaWelcome"])
    body.append(new Element("div", id));
  let observer;
  const context = vm.createContext({
    document,
    db: { settings: {} },
    state: { view: "schools" },
    isAuthenticated: true,
    innerWidth: 1280,
    innerHeight: 900,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(handler) {
      frames.push(handler);
    },
    window: {
      addEventListener(name, handler) {
        listeners.set(name, handler);
      },
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.observed = new Map();
        observer = this;
      }
      observe(target, options) {
        this.observed.set(target, options);
      }
      disconnect() {
        this.observed.clear();
      }
    },
  });
  vm.runInContext(source, context);
  const flush = () => {
    const waiting = frames.splice(0);
    waiting.forEach((handler) => handler());
  };
  const mutate = (target, addedNodes = [], removedNodes = []) => {
    observer.callback([{ target, addedNodes, removedNodes }]);
  };
  return {
    context,
    document,
    body,
    Element,
    elements,
    queries,
    frames,
    observer,
    flush,
    mutate,
    reset() {
      queries.length = 0;
    },
  };
}

test("startup retains a complete enhancement and collects tables just once", () => {
  const f = fixture();
  assert.equal(
    f.queries.filter((row) => row.selector === "#app table,#modalBody table")
      .length,
    1,
  );
  assert.ok(f.queries.some((row) => row.selector === "#app .tabs > button"));
  assert.equal(f.elements.get("uiBottomNav").children.length, 5);
  assert.equal(f.observer.observed.size, 6);
});

for (const id of ["modal", "calPopup", "mobileBar", "pwaWelcome"])
  test(`${id} changes only enhance their own surface without scanning app tables`, () => {
    const f = fixture();
    f.reset();
    f.mutate(f.elements.get(id));
    assert.equal(f.frames.length, 1);
    f.flush();
    assert.ok(
      f.queries.some(
        (row) => row.root === id && row.selector.startsWith("button,"),
      ),
    );
    assert.ok(!f.queries.some((row) => row.selector.includes("#app")));
    assert.equal(
      f.queries.some((row) => row.selector === "#modalBody table"),
      id === "modal",
    );
  });

test("multiple mutations in one frame are coalesced without losing a dirty surface", () => {
  const f = fixture();
  f.reset();
  f.mutate(f.elements.get("modal"));
  f.mutate(f.elements.get("app"));
  f.mutate(f.elements.get("calPopup"));
  f.mutate(f.elements.get("modal"));
  assert.equal(f.frames.length, 1);
  f.flush();
  assert.equal(
    f.queries.filter((row) => row.selector === "#app table,#modalBody table")
      .length,
    1,
  );
  for (const id of ["app", "modal", "calPopup"])
    assert.equal(
      f.queries.filter(
        (row) => row.root === id && row.selector.startsWith("button,"),
      ).length,
      1,
    );
});

test("app-only changes preserve app enhancements without scanning modal tables", () => {
  const f = fixture();
  f.reset();
  f.mutate(f.elements.get("app"));
  f.flush();
  assert.equal(
    f.queries.filter((row) => row.selector === "#app table").length,
    1,
  );
  assert.ok(!f.queries.some((row) => row.selector.includes("#modalBody")));
});

test("ordinary text-node replacement is not skipped", () => {
  const f = fixture(),
    button = new f.Element("button");
  f.elements.get("modal").append(button);
  f.reset();
  f.mutate(button, [{ nodeType: 3 }], [{ nodeType: 3 }]);
  f.flush();
  assert.ok(
    f.queries.some(
      (row) => row.root === "modal" && row.selector.startsWith("button,"),
    ),
  );
  assert.ok(!f.queries.some((row) => row.selector.includes("#app")));
});

test("unknown body content retains the complete legacy enhancement", () => {
  const f = fixture();
  f.reset();
  f.mutate(f.body, [new f.Element("section", "new-legacy-panel")]);
  f.flush();
  assert.ok(
    f.queries.some((row) => row.selector === "#app table,#modalBody table"),
  );
  assert.ok(
    f.queries.some(
      (row) => row.root === "document" && row.selector.startsWith("button,"),
    ),
  );
});

test("direct body text changes conservatively retain the complete pass", () => {
  const f = fixture();
  f.reset();
  f.mutate(f.body, [{ nodeType: 3 }]);
  f.flush();
  assert.ok(
    f.queries.some((row) => row.selector === "#app table,#modalBody table"),
  );
});

test("late PWA root creation is enhanced and starts being observed", () => {
  const f = fixture(),
    replacement = new f.Element("section", "pwaWelcome");
  f.elements.set("pwaWelcome", replacement);
  f.reset();
  f.mutate(f.body, [replacement]);
  f.flush();
  assert.ok(f.observer.observed.has(replacement));
  assert.ok(
    f.queries.some(
      (row) => row.root === "pwaWelcome" && row.selector.startsWith("button,"),
    ),
  );
  assert.ok(!f.queries.some((row) => row.selector.includes("#app")));
});

test("replaced roots are observed instead of their detached predecessors", () => {
  const f = fixture(),
    previous = f.elements.get("modal"),
    replacement = new f.Element("section", "modal");
  previous.isConnected = false;
  f.elements.set("modal", replacement);
  f.reset();
  f.mutate(f.body, [replacement], [previous]);
  f.flush();
  assert.ok(f.observer.observed.has(replacement));
  assert.ok(!f.observer.observed.has(previous));
  f.reset();
  f.mutate(replacement);
  f.flush();
  assert.ok(f.queries.some((row) => row.selector === "#modalBody table"));
});

test("removed roots are not scanned or retained by the observer", () => {
  const f = fixture(),
    previous = f.elements.get("pwaWelcome");
  previous.isConnected = false;
  f.elements.delete("pwaWelcome");
  f.reset();
  f.mutate(f.body, [], [previous]);
  f.flush();
  assert.ok(!f.observer.observed.has(previous));
  assert.ok(!f.queries.some((row) => row.root === "pwaWelcome"));
  assert.ok(!f.queries.some((row) => row.selector.includes("#app")));
});

test("detached unknown mutation targets fail safely to a complete pass", () => {
  const f = fixture();
  f.reset();
  f.mutate(new f.Element("section"));
  f.flush();
  assert.ok(
    f.queries.some((row) => row.selector === "#app table,#modalBody table"),
  );
});

test("non-element mutation targets fall back instead of interrupting enhancement", () => {
  const f = fixture();
  f.reset();
  f.mutate({ nodeType: 11 });
  f.flush();
  assert.ok(
    f.queries.some((row) => row.selector === "#app table,#modalBody table"),
  );
});
