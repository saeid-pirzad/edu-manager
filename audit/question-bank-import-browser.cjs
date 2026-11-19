"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  zlib = require("node:zlib"),
  { main } = require("./data-integrity.cjs");
function zip(entries, compressed) {
  const chunks = [],
    central = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const data = Buffer.from(value),
      filename = Buffer.from(name),
      packed = compressed ? zlib.deflateRawSync(data) : data;
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(compressed ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(compressed ? 8 : 0, 10);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(packed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(filename.length, 28);
    header.writeUInt32LE(offset, 42);
    chunks.push(local, filename, packed);
    central.push(header, filename);
    offset += local.length + filename.length + packed.length;
  }
  const index = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, index, end]);
}
function entries(bytes) {
  const result = [];
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const length = bytes.readUInt32LE(offset + 18),
      names = bytes.readUInt16LE(offset + 26),
      extra = bytes.readUInt16LE(offset + 28),
      start = offset + 30 + names + extra;
    result.push([
      bytes.subarray(offset + 30, offset + 30 + names).toString(),
      bytes.subarray(start, start + length),
    ]);
    offset = start + length;
  }
  return result;
}
main({
  stage: "question-bank-import",
  async runExtra({ cdp, evaluate, cases, root, delay }) {
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    const out = path.join(root, ".cache", "question-import");
    fs.mkdirSync(out, { recursive: true });
    const check = (name, pass, observed = {}) => {
      cases.push({ name: "question import: " + name, pass: !!pass, observed });
      if (!pass) throw Error(name + ": " + JSON.stringify(observed));
    };
    const wait = async (expression) => {
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await delay(30);
      }
      throw Error("Timed out: " + expression);
    };
    await wait(
      "!!globalThis.EduQuestionBankImportUI && !!globalThis.EduQuestionBankRepository && !!globalThis.EduPeriodicReports?.createWorkbook",
    );
    await evaluate(`(async()=>{
    closeModal();goSchools();window.__importSchool=JSON.stringify(db);
    const R=EduQuestionBankRepository,D=EduQuestionBank;
    const original=await R.read();window.__importOriginal=original;
    const bank=D.empty();bank.courses=[{id:'import-course',title:'درس آزمایشی پودمانی',structure:'module'}];
    bank.units=[{id:'import-unit',courseId:'import-course',title:'پودمان اول'},{id:'import-other',courseId:'import-course',title:'پودمان دوم'}];
    await R.save(bank,original.revision);await EduQuestionBankUI.open();
    window.__importSelect=()=>{
      const course=document.querySelector('.qb-toolbar select');course.value='import-course';course.dispatchEvent(new Event('change'));
      const unit=document.querySelector('.qb-section-picker select');unit.value='import-unit';unit.dispatchEvent(new Event('change'));
    };__importSelect();
    window.__importUpload=bytes=>{
      const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],'questions.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const input=document.querySelector('.qb-import input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change'));
    };
    window.__importRows=()=>[EduQuestionBankImport.headers,...EduQuestionBankImport.examples];
  })()`);
    const originalBytes = Buffer.from(
      await evaluate(
        `(async()=>Array.from(new Uint8Array(await EduPeriodicReports.createWorkbook([{name:'سؤال‌ها',rows:__importRows()}]).arrayBuffer())))()`,
      ),
    );
    const stored = entries(originalBytes),
      compressed = zip(stored, true);
    const toFile = (bytes) =>
      `new File([new Uint8Array(${JSON.stringify([...bytes])})],'questions.xlsx')`;
    check(
      "template is a real workbook with a blank input sheet and four separate examples",
      await evaluate(
        `(async()=>{const I=EduQuestionBankImport,s=I.templateSheets(),file=new File([EduPeriodicReports.createWorkbook(s)],'template.xlsx');const rows=await I.readXlsx(file);return s.length===3&&rows.length===1001&&rows.slice(1).every(row=>row.cells.every(c=>!c))&&s[1].rows.length===5;})()`,
      ),
    );
    for (const [name, bytes] of [
      ["stored XLSX", originalBytes],
      ["compressed Excel XLSX", compressed],
    ])
      check(
        name + " parses four types without changing either database",
        await evaluate(
          `(async()=>{const bank=await EduQuestionBankRepository.read(),before=JSON.stringify(bank),rows=await EduQuestionBankImport.readXlsx(${toFile(bytes)}),report=EduQuestionBankImport.preview(rows,bank,'import-unit');return report.ready===4&&report.errors===0&&report.results[0].question.answer===3&&JSON.stringify(await EduQuestionBankRepository.read())===before&&JSON.stringify(db)===__importSchool;})()`,
        ),
      );
    const shared = [];
    let sharedCount = 0;
    const withShared = stored.map(([name, value]) => {
      if (name !== "xl/worksheets/sheet1.xml") return [name, value];
      return [
        name,
        value
          .toString()
          .replace(
            /<c([^>]*?)t="inlineStr"([^>]*?)><is><t[^>]*>([\s\S]*?)<\/t><\/is><\/c>/g,
            (_, a, b, text) => {
              shared.push('<si><t xml:space="preserve">' + text + "</t></si>");
              return `<c${a}t="s"${b}><v>${sharedCount++}</v></c>`;
            },
          ),
      ];
    });
    withShared.push([
      "xl/sharedStrings.xml",
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        shared.join("") +
        "</sst>",
    ]);
    check(
      "Excel shared strings are read correctly",
      sharedCount > 0 &&
        (await evaluate(
          `(async()=>{const rows=await EduQuestionBankImport.readXlsx(${toFile(zip(withShared, true))});return EduQuestionBankImport.preview(rows,await EduQuestionBankRepository.read(),'import-unit').ready===4;})()`,
        )),
    );
    for (const [name, bytes] of [
      [
        "merged cells",
        zip(
          stored.map(([name, value]) => [
            name,
            name === "xl/worksheets/sheet1.xml"
              ? value
                  .toString()
                  .replace(
                    "</worksheet>",
                    '<mergeCells><mergeCell ref="A2:B2"/></mergeCells></worksheet>',
                  )
              : value,
          ]),
          true,
        ),
      ],
      ["corrupt ZIP", compressed.subarray(0, compressed.length - 4)],
    ])
      check(
        name + " is rejected",
        await evaluate(
          `(async()=>{try{await EduQuestionBankImport.readXlsx(${toFile(bytes)});return false;}catch{return true;}})()`,
        ),
      );
    const formula = zip(
      stored.map(([name, value]) => [
        name,
        name === "xl/worksheets/sheet1.xml"
          ? value
              .toString()
              .replace('<row r="2"', '<row r="2"')
              .replace('<c r="B2"', '<c r="B2"')
              .replace(/(<c r="B2"[^>]*>)/, "$1<f>1+1</f>")
          : value,
      ]),
      true,
    );
    check(
      "a formula prevents the entire import",
      await evaluate(
        `(async()=>{const report=EduQuestionBankImport.preview(await EduQuestionBankImport.readXlsx(${toFile(formula)}),await EduQuestionBankRepository.read(),'import-unit');return report.errors===1&&report.ready===3;})()`,
      ),
    );
    await evaluate(`document.querySelector('.qb-import-entry').click()`);
    await wait("!!document.querySelector('.qb-import')");
    await cdp("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: out,
    });
    const downloadedTemplate = path.join(
      out,
      "Classyar-Questions-Template-v1.xlsx",
    );
    fs.rmSync(downloadedTemplate, { force: true });
    await evaluate("document.querySelector('.qb-import-template').click()");
    for (let i = 0; i < 100 && !fs.existsSync(downloadedTemplate); i++)
      await delay(30);
    check(
      "template download matches the supplied offline template",
      fs.existsSync(downloadedTemplate) &&
        fs
          .readFileSync(downloadedTemplate)
          .equals(
            fs.readFileSync(
              path.join(
                root,
                "docs/templates/Classyar-Questions-Template-v1.xlsx",
              ),
            ),
          ),
    );
    await evaluate(`__importUpload(${JSON.stringify([...compressed])})`);
    await wait("document.querySelectorAll('.qb-import-rows > li').length===4");
    check(
      "preview does not persist questions before confirmation",
      await evaluate(
        "(async()=> (await EduQuestionBankRepository.read()).questions.length===0)()",
      ),
    );
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(80);
      const observed = await evaluate(
        `(()=>{const panel=document.querySelector('.qb-import'),box=panel.getBoundingClientRect(),buttons=[...panel.querySelectorAll('button')].filter(b=>b.getClientRects().length);return {contained:box.left>=0&&box.right<=innerWidth+1&&panel.scrollWidth<=panel.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1,targets:buttons.every(b=>b.getBoundingClientRect().height>=44&&b.scrollWidth<=b.clientWidth+1),buttons:buttons.map(b=>({text:b.textContent,height:b.getBoundingClientRect().height,width:b.clientWidth,scroll:b.scrollWidth})),count:panel.querySelectorAll('.qb-import-rows > li').length};})()`,
      );
      check(
        "responsive preview " + width,
        observed.contained && observed.targets && observed.count === 4,
        observed,
      );
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(out, `preview-${width}.png`),
        Buffer.from(shot.data, "base64"),
      );
    }
    await evaluate(
      `document.querySelector('.qb-import-footer button').click()`,
    );
    await wait("!!document.querySelector('.qb-import-success')");
    check(
      "final confirmation adds four questions atomically only in the selected unit",
      await evaluate(
        `(async()=>{const bank=await EduQuestionBankRepository.read();return bank.questions.length===4&&bank.questions.every(q=>q.unitId==='import-unit')&&bank.exams.length===0&&JSON.stringify(db)===__importSchool;})()`,
      ),
    );
    await evaluate(
      `document.querySelector('.qb-import-entry').click();__importUpload(${JSON.stringify([...compressed])})`,
    );
    await wait("document.querySelectorAll('.qb-import-rows > li').length===4");
    check(
      "reimporting the file skips duplicates and disables an empty commit",
      await evaluate(
        `document.querySelectorAll('.qb-import-rows > [data-state=duplicate]').length===4&&document.querySelector('.qb-import-footer button').disabled`,
      ),
    );
    await evaluate(
      `(async()=>{const rows=[EduQuestionBankImport.headers,...Array.from({length:71},(_,i)=>{const row=[...EduQuestionBankImport.examples[3]];row[1]='سؤال گروهی '+i;return row;})];const blob=EduPeriodicReports.createWorkbook([{name:'سؤال‌ها',rows}]);__importUpload(Array.from(new Uint8Array(await blob.arrayBuffer())));})()`,
    );
    await wait("document.querySelectorAll('.qb-import-rows > li').length===25");
    check(
      "large previews paginate 25 rows instead of growing indefinitely",
      await evaluate(
        `(()=>{const root=document.querySelector('.qb-import'),list=root.querySelector('.qb-import-rows');return root.querySelector('.qb-pager').textContent.includes('۳')&&list.scrollHeight>list.clientHeight&&list.clientHeight<=innerHeight/2+1;})()`,
      ),
    );
    await evaluate(
      "document.querySelector('.qb-import .qb-pager button:last-child').click();document.querySelector('.qb-import .qb-pager button:last-child').click()",
    );
    check(
      "the last preview page contains the remaining rows",
      await evaluate(
        "document.querySelectorAll('.qb-import-rows > li').length===21",
      ),
    );
    await evaluate(
      "goSchools();document.querySelector('.qb-confirm-actions button:last-child').click()",
    );
    await wait("state.view==='schools'");
    await delay(80);
    check(
      "leaving the page removes preview actions and preserves the school data",
      await evaluate(
        "!document.querySelector('.qb-import')&&JSON.stringify(db)===__importSchool",
      ),
    );
    await evaluate(
      `(async()=>{await EduQuestionBankUI.open();__importSelect();document.querySelector('.qb-import-entry').click();__importUpload(${JSON.stringify([...formula])});})()`,
    );
    await wait(
      "!!document.querySelector('.qb-import-rows > [data-state=error]')",
    );
    check(
      "UI blocks a file containing even one erroneous row",
      await evaluate(
        "document.querySelector('.qb-import-footer button').disabled&&document.querySelector('.qb-import-status').getAttribute('role')==='alert'",
      ),
    );
    // A file read resolving after navigation cannot recreate a preview.
    await evaluate(
      `(()=>{const I=EduQuestionBankImport,read=I.readXlsx;window.__importRead=read;I.readXlsx=()=>new Promise(resolve=>window.__importRelease=resolve);__importUpload(${JSON.stringify([...compressed])});goSchools();})()`,
    );
    await evaluate(
      `__importRelease([{number:1,cells:EduQuestionBankImport.headers}]);EduQuestionBankImport.readXlsx=__importRead`,
    );
    await delay(80);
    check(
      "late file reads cannot reopen a departed page",
      await evaluate(
        "state.view==='schools'&&!document.querySelector('.qb-import')",
      ),
    );
    check(
      "concurrent changes and cancelled transactions cannot partially append imported questions",
      await evaluate(`(async()=>{
      const R=EduQuestionBankRepository,I=EduQuestionBankImport,before=await R.read(),row=[...I.examples[0]];
      row[1]+=' تازه';const report=I.preview([{number:1,cells:I.headers},{number:2,cells:row}],before,'import-unit'),next=I.prepare(report,before);
      const changed=structuredClone(before);changed.courses[0].title+=' ویرایش هم‌زمان';await R.save(changed,before.revision);
      const stable=JSON.stringify(await R.read());let conflict=false,cancelled=false;
      try{await R.save(next,before.revision);}catch{conflict=true;}
      try{await R.save(next,before.revision+1,{isCurrent:()=>false});}catch{cancelled=true;}
      return conflict&&cancelled&&JSON.stringify(await R.read())===stable&&(await R.read()).questions.length===4&&JSON.stringify(db)===__importSchool;
    })()`),
    );
    await evaluate(
      "(async()=>{const R=EduQuestionBankRepository,current=await R.read();await R.save(__importOriginal,current.revision);})()",
    );
    console.log("Question import previews: " + out);
  },
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
