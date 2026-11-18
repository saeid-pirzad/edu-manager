"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
async function generate() {
  const root = path.resolve(__dirname, "..");
  const context = vm.createContext({
    Blob,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    DataView,
  });
  for (const file of [
    "src/features/question-bank/domain.js",
    "src/features/question-bank/question-import.js",
    "src/reports/periodic/xlsx-workbook.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  const blob = vm.runInContext(
    "xlsxWorkbook(EduQuestionBankImport.templateSheets())",
    context,
  );
  const destination = path.join(
    root,
    "docs",
    "templates",
    "Classyar-Questions-Template-v1.xlsx",
  );
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(await blob.arrayBuffer()));
  console.log("Generated " + destination);
}
if (require.main === module)
  generate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
module.exports = { generate };
