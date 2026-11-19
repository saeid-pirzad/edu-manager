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
    // Exercise the actual XLSX parser through both course structures, exam
    // snapshots and the two student outputs. No native Excel/Word installation
    // or existing browser profile is needed for these regression contracts.
    const longOption = (label) =>
      label +
      " — در این روش، تنظیمات شبکه و مجوز دسترسی کاربران پیش از اجرای برنامه بررسی می‌شود و نتیجه به صورت دقیق در گزارش ثبت خواهد شد.";
    const scenarioRows = [
      [
        "mcq",
        "Choose the correct network device?",
        "Switch",
        "Router",
        "Hub",
        "Modem",
        "۲",
        "۰٫۷۵",
        "SECRET-EXPLANATION-1",
      ],
      [
        "mcq",
        "کدام روش برای بررسی دسترسی کاربران مناسب‌تر است؟",
        ...["روش اول", "روش دوم", "روش سوم", "روش چهارم"].map(longOption),
        "۴",
        "۱٫۲۵",
        "SECRET-EXPLANATION-2",
      ],
      [
        "mcq",
        "کدام قطعه کد پیام فارسی را نمایش می‌دهد؟",
        '  const text = "سلام";\n  console.log(text);',
        'const text = "خداحافظ";\nconsole.log(text);',
        'const text = "درود";\nconsole.log(text);',
        'const text = "خوش آمدید";\nconsole.log(text);',
        "1",
        "1",
        "SECRET-EXPLANATION-3",
      ],
      [
        "boolean",
        'قطعه کد زیر پیام را نمایش می‌دهد؟\nconst label = "سلام";\nconsole.log(label);',
        "",
        "",
        "",
        "",
        "صحیح",
        "۱٫۲۵",
        "SECRET-EXPLANATION-4",
      ],
      [
        "boolean",
        "A switch connects devices in a local network.",
        "",
        "",
        "",
        "",
        "false",
        "0.50",
        "SECRET-EXPLANATION-5",
      ],
      ...["001", "1e3", "1/2", "=SUM(1,2)", "_x005F_x0042_"].map(
        (literal, i) => [
          "blank",
          "Write the literal " + literal + " in the blank: ____.",
          "",
          "",
          "",
          "",
          literal,
          "0.25",
          "SECRET-EXPLANATION-" + (i + 6),
        ],
      ),
      [
        "essay",
        '  خروجی قطعه کد زیر چیست؟\nconst label = "سلام";\nif (label) {\n  console.log(label);\n}',
        "",
        "",
        "",
        "",
        "  SECRET-ANSWER-PERSIAN\n",
        "1.50",
        "  SECRET-EXPLANATION-10\n",
      ],
      [
        "essay",
        "Explain how a router forwards an IP packet.",
        "",
        "",
        "",
        "",
        "SECRET-ANSWER-ENGLISH",
        "۲",
        "SECRET-EXPLANATION-11",
      ],
    ];
    await evaluate(`(async()=>{
      await EduQuestionBankUI.open();__importSelect();document.querySelector('.qb-import-entry').click();
      const file=EduPeriodicReports.createWorkbook([{name:'سؤال‌ها',rows:[EduQuestionBankImport.headers,...${JSON.stringify(scenarioRows)}]}]);
      __importUpload(Array.from(new Uint8Array(await file.arrayBuffer())));
    })()`);
    await wait(
      `document.querySelectorAll('.qb-import-rows > li').length===${scenarioRows.length}`,
    );
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(100);
      const preview = await evaluate(`(()=>{
        const panel=document.querySelector('.qb-import'),items=[...panel.querySelectorAll('.qb-import-rows > li')];
        const mixed=items.find(item=>item.querySelector('.qb-import-question-text').textContent.includes('خروجی قطعه کد زیر چیست؟'));
        const lines=[...mixed.querySelectorAll('.qb-import-question-text .qb-import-line')];
        const long=items[1].querySelector('.qb-import-options'),code=items[2].querySelector('.qb-import-options'),english=items[0].querySelector('.qb-import-options');
        const stacked=list=>[...list.children].every((item,i,all)=>!i||item.getBoundingClientRect().top>=all[i-1].getBoundingClientRect().bottom-1);
        const inside=[...panel.querySelectorAll('.qb-import-options')].every(list=>{const bounds=list.getBoundingClientRect();return list.scrollWidth<=list.clientWidth+1&&[...list.children].every(item=>{const box=item.getBoundingClientRect();return box.left>=bounds.left-1&&box.right<=bounds.right+1;});});
        return {count:items.length===${scenarioRows.length},contained:panel.scrollWidth<=panel.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1,inside,stacked:stacked(long)&&stacked(code),lines:lines.map(line=>line.dir).join(',')==='rtl,ltr,ltr,ltr,ltr',indent:lines[0].textContent.startsWith('  خروجی')&&lines[3].textContent==='  console.log(label);',optionLines:[...code.querySelectorAll('.qb-import-line')].length===8&&[...code.querySelectorAll('.qb-import-line')].every(line=>line.dir==='ltr'),english:english.dir==='ltr'&&items[0].querySelector('.qb-import-question-text').dir==='ltr',details:items.every(item=>item.querySelector('.qb-import-detail-text')),correctIndex:items[0].textContent.includes('گزینهٔ ۲'),literal:items[9].querySelector('.qb-import-detail-text').textContent==='_x005F_x0042_'};
      })()`);
      check(
        "mixed XLSX preview preserves line directions, indentation, long-option layout and literal answer at " +
          width,
        Object.values(preview).every(Boolean),
        preview,
      );
      const scenarioShot = await cdp("Page.captureScreenshot", {
        format: "png",
      });
      fs.writeFileSync(
        path.join(out, `mixed-preview-${width}.png`),
        Buffer.from(scenarioShot.data, "base64"),
      );
    }
    await evaluate(
      "goSchools();document.querySelector('.qb-confirm-actions button:last-child').click()",
    );
    await wait("state.view==='schools'");
    const pipeline = await evaluate(`(async()=>{
      const R=EduQuestionBankRepository,D=EduQuestionBank,I=EduQuestionBankImport;
      const original=await R.read(),school=JSON.stringify(db),rows=${JSON.stringify(scenarioRows)};
      const bytes=await EduPeriodicReports.createWorkbook([{name:'سؤال‌ها',rows:[I.headers,...rows]}]).arrayBuffer();
      const parsed=await I.readXlsx(new File([bytes],'mixed-scenarios.xlsx'));
      const unchanged=JSON.stringify(await R.read())===JSON.stringify(original)&&JSON.stringify(db)===school;
      let bank=structuredClone(original);bank.courses.push({id:'roundtrip-chapter-course',title:'شبکه و نرم‌افزار ـ فصل',structure:'chapter'});
      bank.units.push({id:'roundtrip-chapter-unit',courseId:'roundtrip-chapter-course',title:'فصل اول'});
      const reports=[],exams=[],source=JSON.stringify(original.questions),oldExams=JSON.stringify(original.exams);
      for(const target of [{courseId:'import-course',unitId:'import-other'},{courseId:'roundtrip-chapter-course',unitId:'roundtrip-chapter-unit'}]){
        const report=I.preview(parsed,bank,target.unitId);reports.push({ready:report.ready,errors:report.errors,duplicates:report.duplicates});
        bank=I.prepare(report,bank);
        const exam=D.generate(bank,{title:'آزمون یکپارچه اکسل',courseId:target.courseId,unitIds:[target.unitId],counts:{mcq:3,boolean:2,blank:5,essay:2},totalScore:'۹٫۵',school:'هنرستان نمونه',teacher:'دبیر نمونه',date:'2026-11-20',duration:60},()=>0.5);
        bank.exams.push(exam);exams.push(exam);
      }
      D.validate(bank);await R.save(bank,original.revision);
      const saved=await R.read();window.__importRoundtripExams=exams;window.__importRoundtripBank=JSON.stringify(saved);
      const expectedScores=[75,125,100,125,50,25,25,25,25,25,150,200];
      const exact=exams.every(exam=>exam.questions.length===rows.length&&exam.questions.reduce((sum,q)=>sum+q.score,0)===950&&rows.every((row,index)=>{
        const q=exam.questions.find(item=>item.text===row[1]);
        return q&&q.score===expectedScores[index]&&q.explanation===row[8]&&
          (row[0]!=='mcq'||JSON.stringify(q.options)===JSON.stringify(row.slice(2,6))&&q.answer===([1,3,0][index]))&&
          (!['blank','essay'].includes(row[0])||q.answer===row[6])&&
          (row[0]!=='boolean'||q.answer===(index===3));
      }));
      return {unchanged,reports,exact,oldQuestions:JSON.stringify(saved.questions.slice(0,original.questions.length))===source,oldExams:JSON.stringify(saved.exams.slice(0,original.exams.length))===oldExams,questions:saved.questions.length-original.questions.length,exams:saved.exams.length-original.exams.length,school:JSON.stringify(db)===school};
    })()`);
    check(
      "real XLSX preserves all four types, exact scores, literal text and multiline code through chapter/module exam snapshots",
      pipeline.unchanged &&
        pipeline.exact &&
        pipeline.oldQuestions &&
        pipeline.oldExams &&
        pipeline.school &&
        pipeline.questions === scenarioRows.length * 2 &&
        pipeline.exams === 2 &&
        pipeline.reports.every(
          (report) =>
            report.ready === scenarioRows.length &&
            report.errors === 0 &&
            report.duplicates === 0,
        ),
      pipeline,
    );
    await evaluate(`(async()=>{
      window.__importBeforeEditor=await EduQuestionBankRepository.read();
      window.__importCanonical=value=>Array.isArray(value)?value.map(__importCanonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,__importCanonical(value[key])])):value;
      await EduQuestionBankUI.open();__importSelect();
      const unit=document.querySelector('.qb-section-picker select');unit.value='import-other';unit.dispatchEvent(new Event('change'));
    })()`);
    for (const [type, needle] of [
      ["essay", "خروجی قطعه کد زیر چیست؟"],
      ["mcq", "کدام قطعه کد پیام فارسی را نمایش می‌دهد؟"],
    ]) {
      await evaluate(`(()=>{
        const type=document.querySelector('.qb-filters select');type.value=${JSON.stringify(type)};type.dispatchEvent(new Event('change'));
        const search=document.querySelector('.qb-filters input[type=search]');search.value=${JSON.stringify(needle)};search.dispatchEvent(new Event('input'));
        const row=document.querySelector('.qb-question-row');row.querySelector('summary').click();row.querySelector('.qb-question-actions button').click();
        document.querySelector('.qb-question-form').requestSubmit();
      })()`);
      await wait(
        "!document.querySelector('.qb-question-form')&&!!document.querySelector('.qb-question-row')",
      );
      const edited = await evaluate(`(async()=>{
          const bank=await EduQuestionBankRepository.read(),original=__importBeforeEditor.questions.find(q=>q.unitId==='import-other'&&q.type===${JSON.stringify(type)}&&q.text.includes(${JSON.stringify(needle)}));
          const saved=bank.questions.find(q=>q.id===original.id);
          return {question:JSON.stringify(__importCanonical(saved))===JSON.stringify(__importCanonical(original)),text:saved.text===original.text,answer:saved.answer===original.answer,explanation:saved.explanation===original.explanation,options:JSON.stringify(saved.options)===JSON.stringify(original.options),exams:JSON.stringify(bank.exams)===JSON.stringify(__importBeforeEditor.exams),school:JSON.stringify(db)===__importSchool,before:original,after:saved};
        })()`);
      check(
        "saving an imported " +
          type +
          " unchanged preserves raw question, answer, explanation and multiline options",
        [
          "question",
          "text",
          "answer",
          "explanation",
          "options",
          "exams",
          "school",
        ].every((key) => edited[key]),
        edited,
      );
    }
    check(
      "opening and saving imported content changes only the revision, never existing questions or exam snapshots",
      await evaluate(`(async()=>{
        const bank=await EduQuestionBankRepository.read(),before=structuredClone(__importBeforeEditor),after=structuredClone(bank);
        delete before.revision;delete after.revision;
        window.__importRoundtripBank=JSON.stringify(bank);goSchools();
        return JSON.stringify(__importCanonical(before))===JSON.stringify(__importCanonical(after));
      })()`),
    );
    const word = await evaluate(`(()=>{
      const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main',results=[];
      for(const exam of __importRoundtripExams){
        const xml=EduQuestionBankSchoolWord.documentXml(exam),doc=new DOMParser().parseFromString(xml,'application/xml');
        const text=node=>[...node.getElementsByTagNameNS(NS,'t')].map(item=>item.textContent).join('');
        const paragraphs=[...doc.getElementsByTagNameNS(NS,'p')];
        const bidi=node=>node.getElementsByTagNameNS(NS,'bidi')[0]?.getAttributeNS(NS,'val');
        const code=paragraphs.filter(p=>text(p).includes('const label = "سلام";')||text(p).includes('  console.log(label);'));
        const optionCode=paragraphs.filter(p=>text(p).includes('const text = "')||text(p).trim()==='console.log(text);');
        const english=paragraphs.filter(p=>text(p).includes('Explain how a router')||text(p).includes('Choose the correct network'));
        const persian=paragraphs.find(p=>text(p).includes('خروجی قطعه کد زیر چیست؟'));
        const tables=[...doc.getElementsByTagNameNS(NS,'tbl')];
        const longTable=tables.find(table=>text(table).includes('روش اول —')&&table!==tables[0]);
        const longRows=longTable?[...longTable.children].filter(n=>n.localName==='tr'):[];
        const questionRows=[...tables[0].children].filter(n=>n.localName==='tr').slice(1,-1);
        const labels=questionRows.every((row,index)=>{
          const value=text(row),q=exam.questions[index],english=/^[A-Za-z]/.test(q.text);
          return value.startsWith((english?String(index+1):new Intl.NumberFormat('fa-IR').format(index+1))+'. ');
        });
        results.push({xml:!doc.querySelector('parsererror'),noAnswers:!text(doc).includes('SECRET-'),labels,code:code.length>=3&&code.every(p=>bidi(p)==='0'),optionCode:optionCode.length===8&&optionCode.every(p=>bidi(p)==='0'),indent:code.some(p=>text(p)==='  console.log(label);'),english:english.length===2&&english.every(p=>bidi(p)==='0'),persian:!!persian&&bidi(persian)==='1',literals:['001','1e3','1/2','=SUM(1,2)','_x005F_x0042_'].every(v=>text(doc).includes(v)),longOptions:longRows.length===4&&longRows.every(row=>[...row.children].filter(n=>n.localName==='tc').length===1)});
      }
      return results;
    })()`);
    check(
      "imported exams produce well-formed answer-free Word with per-line directions, literal text, numbering and stacked long options",
      word.length === 2 &&
        word.every((result) => Object.values(result).every(Boolean)),
      word,
    );
    const printed = await evaluate(`(async()=>{
      const results=[];
      for(const exam of __importRoundtripExams){
        let observed;
        const observer=new MutationObserver(()=>{
          const frame=document.querySelector('.qb-print-frame');
          if(frame)frame.contentWindow.print=()=>{
            const doc=frame.contentDocument,rows=[...doc.querySelectorAll('.qb-sheet-question')];
            const validRows=rows.map((row,index)=>{
              const q=exam.questions[index],prompt=row.querySelector('.qb-sheet-prompt p'),number=row.querySelector('.qb-sheet-number'),p=prompt.getBoundingClientRect();
              const lines=[...prompt.querySelectorAll('.qb-sheet-line')];
              const exactLines=!lines.length||lines.every((line,i)=>line.textContent===((i===0&&prompt.dir==='ltr'?(index+1)+'. ':'')+q.text.split('\\n')[i]));
              const directions=lines.every(line=>line.dir===(/^(const |if \\(|\\s*console\\.|})/.test(line.textContent)?'ltr':'rtl'));
              const english=/^[A-Za-z]/.test(q.text);
              const numbering=english?prompt.dir==='ltr'&&prompt.textContent.startsWith((index+1)+'. ')&&number.textContent==='':prompt.dir==='rtl'&&number.textContent===new Intl.NumberFormat('fa-IR').format(index+1)+'.';
              const options=row.querySelector('.qb-sheet-options');
              const optionDirections=!options||[...options.querySelectorAll('.qb-sheet-line')].every(line=>line.dir==='ltr');
              const bounds=options?.getBoundingClientRect();
              const inside=!options||(bounds.left>=p.left-1&&bounds.right<=p.right+1&&[...options.children].every(item=>{const box=item.getBoundingClientRect();return box.left>=p.left-1&&box.right<=p.right+1;}));
              const stacked=!options||!q.options.some(o=>o.length>80||o.includes('\\n'))||[...options.children].every((item,i,all)=>!i||item.getBoundingClientRect().top>=all[i-1].getBoundingClientRect().bottom-1);
              return {exactLines,directions,optionDirections,numbering,inside,stacked};
            });
            observed={count:rows.length===exam.questions.length,noAnswers:!doc.body.textContent.includes('SECRET-'),validRows,contained:doc.body.scrollWidth<=doc.body.clientWidth+1};
            frame.contentWindow.dispatchEvent(new Event('afterprint'));
          };
        });
        observer.observe(document.body,{childList:true});
        try{await EduQuestionBankUI.print(exam);}finally{observer.disconnect();}
        results.push({...observed,cleaned:!document.querySelector('.qb-print-frame')});
      }
      return {results,unchanged:JSON.stringify(await EduQuestionBankRepository.read())===__importRoundtripBank&&JSON.stringify(db)===__importSchool};
    })()`);
    check(
      "actual imported exam print frames keep numbering, code direction and long English/Persian options out of the score column without exposing answers or changing data",
      printed.unchanged &&
        printed.results.length === 2 &&
        printed.results.every(
          (result) =>
            result.count &&
            result.noAnswers &&
            result.contained &&
            result.cleaned &&
            result.validRows.every((row) => Object.values(row).every(Boolean)),
        ),
      printed,
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
