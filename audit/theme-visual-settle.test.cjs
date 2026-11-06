"use strict";
const assert = require("node:assert/strict"),
  test = require("node:test"),
  vm = require("node:vm"),
  { settleThemePaint } = require("./theme-browser.cjs");

function fixture(animations) {
  const state = { frames: 0, reads: 0, mutationCalls: 0 };
  const readWaiters = [];
  const context = vm.createContext({
    document: {
      getAnimations() {
        state.reads++;
        for (const waiter of readWaiters)
          if (state.reads >= waiter.count) waiter.resolve();
        return typeof animations === "function" ? animations() : animations;
      },
    },
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      state.frames++;
      return setTimeout(() => callback(performance.now()), 0);
    },
  });
  const settle = vm.runInContext(
    "(" + settleThemePaint.toString() + ")",
    context,
  );
  return {
    settle,
    state,
    waitForReads(count) {
      return state.reads >= count
        ? Promise.resolve()
        : new Promise((resolve) => readWaiters.push({ count, resolve }));
    },
  };
}

function animation(endTime = 150) {
  let resolve, reject;
  const item = {
    playState: "running",
    effect: { getComputedTiming: () => ({ endTime }) },
    finished: new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    }),
    cancel() {
      throw Error("The observer must not cancel native animation");
    },
    finish() {
      throw Error("The observer must not force native completion");
    },
  };
  return {
    item,
    finish() {
      item.playState = "finished";
      resolve(item);
    },
    cancel() {
      item.playState = "idle";
      reject(new DOMException("Replaced transition", "AbortError"));
    },
    reject,
  };
}

test("a quiet cascade still receives two native animation frames before sampling", async () => {
  const f = fixture([]),
    result = await f.settle();
  assert.equal(f.state.frames, 2);
  assert.equal(f.state.reads, 1);
  assert.equal(result.waitedAnimations, 0);
});

test("finite transitions are awaited naturally with two paint frames after completion", async () => {
  const a = animation(),
    f = fixture([a.item]);
  const pending = f.settle();
  await f.waitForReads(1);
  assert.equal(f.state.frames, 2);
  a.finish();
  const result = await pending;
  assert.equal(result.waitedAnimations, 1);
  assert.equal(result.batches, 1);
  assert.equal(f.state.frames, 4);
  assert.equal(f.state.reads, 2);
});

test("a cancelled CSS transition is rechecked rather than failed or forcibly finished", async () => {
  const a = animation(),
    f = fixture([a.item]);
  const pending = f.settle();
  await f.waitForReads(1);
  a.cancel();
  const result = await pending;
  assert.equal(result.waitedAnimations, 1);
  assert.equal(f.state.frames, 4);
});

test("a transition created by cancelling its predecessor is also awaited", async () => {
  const a = animation(),
    b = animation();
  let current = a.item;
  const f = fixture(() => [current]),
    pending = f.settle();
  await f.waitForReads(1);
  current = b.item;
  a.cancel();
  await f.waitForReads(2);
  b.finish();
  const result = await pending;
  assert.equal(result.waitedAnimations, 2);
  assert.equal(result.batches, 2);
  assert.equal(f.state.frames, 6);
});

test("infinite decorative animation is ignored without reading its unfinishable promise", async () => {
  const infinite = {
    playState: "running",
    effect: { getComputedTiming: () => ({ endTime: Infinity }) },
    get finished() {
      throw Error("Infinite animation cannot be awaited");
    },
    cancel() {
      throw Error("Do not cancel decoration");
    },
  };
  const f = fixture([infinite]),
    result = await f.settle();
  assert.equal(result.waitedAnimations, 0);
  assert.equal(f.state.frames, 2);
});

test("finished and idle finite animations are not awaited again", async () => {
  const items = ["finished", "idle"].map((playState) => ({
    playState,
    effect: { getComputedTiming: () => ({ endTime: 150 }) },
    get finished() {
      throw Error("Inactive animation cannot delay sampling");
    },
  }));
  assert.equal((await fixture(items).settle()).waitedAnimations, 0);
});

test("a stuck or paused finite animation fails within the bounded audit deadline", async () => {
  for (const playState of ["running", "paused"]) {
    const a = animation();
    a.item.playState = playState;
    const f = fixture([a.item]),
      start = performance.now();
    await assert.rejects(
      f.settle({ timeoutMs: 25 }),
      /did not settle within 25ms/,
    );
    assert.ok(performance.now() - start < 500);
    assert.equal(a.item.playState, playState);
  }
});

test("unexpected animation failures remain genuine audit failures", async () => {
  const a = animation(),
    f = fixture([a.item]);
  const pending = f.settle();
  await f.waitForReads(1);
  a.reject(Error("Synthetic native animation failure"));
  await assert.rejects(pending, /Synthetic native animation failure/);
});

test("invalid deadlines fail instead of disabling bounded paint synchronization", async () => {
  for (const timeoutMs of [0, -1, Infinity, NaN])
    await assert.rejects(
      fixture([]).settle({ timeoutMs }),
      /positive finite duration/,
    );
});
