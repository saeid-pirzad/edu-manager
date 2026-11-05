"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  approvedButtonColors,
  isClippedAccessibleLabel,
} = require("./button-controls-browser.cjs");

test("visual centering excludes clipped accessible text, not ordinary or merely small labels", () => {
  const hidden = {
    position: "absolute",
    overflow: "hidden",
    clipPath: "inset(50%)",
  };
  assert.equal(isClippedAccessibleLabel(hidden, { width: 1, height: 1 }), true);
  assert.equal(
    isClippedAccessibleLabel(
      { position: "fixed", clip: "rect(0px, 0px, 0px, 0px)" },
      { width: 1, height: 1 },
    ),
    true,
  );
  assert.equal(
    isClippedAccessibleLabel(hidden, { width: 80, height: 20 }),
    false,
  );
  assert.equal(
    isClippedAccessibleLabel(
      { ...hidden, position: "static" },
      { width: 1, height: 1 },
    ),
    false,
  );
  assert.equal(
    isClippedAccessibleLabel(
      { position: "absolute", overflow: "visible" },
      { width: 1, height: 1 },
    ),
    false,
  );
});

test("backup color roles use exact approved product colors without weakening ordinary button rules", () => {
  const button = {
    tone: "download",
    variant: "solid",
    colorRole: "backup-primary",
    color: "rgb(255, 255, 255)",
    background: "rgb(192, 20, 27)",
  };
  assert.equal(approvedButtonColors(button), true);
  assert.equal(approvedButtonColors({ ...button, colorRole: "action" }), false);
  assert.equal(
    approvedButtonColors({ ...button, background: "rgb(255, 0, 0)" }),
    false,
  );
  assert.equal(
    approvedButtonColors({ ...button, variant: "unexpected" }),
    false,
  );
  assert.equal(
    approvedButtonColors({
      ...button,
      colorRole: "action",
      background: "rgb(88, 89, 91)",
    }),
    true,
  );
  const amber = {
    tone: "share",
    variant: "soft",
    colorRole: "backup-secondary",
    color: "rgb(124, 81, 5)",
    background: "rgb(255, 250, 237)",
  };
  assert.equal(approvedButtonColors(amber), true);
  assert.equal(approvedButtonColors({ ...amber, colorRole: "action" }), false);
  assert.equal(
    approvedButtonColors({ ...amber, background: "rgb(255, 255, 255)" }),
    false,
  );
  assert.equal(
    approvedButtonColors({
      tone: "upload",
      variant: "soft",
      colorRole: "backup-primary",
      color: "rgb(192, 20, 27)",
      background: "rgb(254, 240, 240)",
    }),
    true,
  );
});
