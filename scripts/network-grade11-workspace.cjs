"use strict";
// Actual application, separate stable local origin, persistent browser data.
// No exports, no user-profile automation, no writes to the production bank.
const { createReviewServer } = require("./question-bank-review.cjs");
const { createNetworkGrade11Bank } = require("./fixtures/network-grade11.cjs");
const server = createReviewServer({ createBank: createNetworkGrade11Bank });
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(4176, "127.0.0.1", () => {
  console.log("Grade 11 application workspace: http://127.0.0.1:4176/");
  console.log(
    "First visit registers 24 questions and 4 exams in this browser. Existing workspace data is never replaced.",
  );
});
