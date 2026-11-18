"use strict";
// The unified hub is exercised only in the integrity runner's disposable origin
// and profile. No user database, selected file, or permission is accessed.
const fs = require("node:fs");
const path = require("node:path");
const { main } = require("./data-integrity.cjs");

function inspectHubLayout() {
  const hub = document.getElementById("backupHub"),
    tabs = [...hub.querySelectorAll('[role="tab"]')],
    selected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true"),
    active = document.getElementById(selected.getAttribute("aria-controls")),
    visibleButtons = [...hub.querySelectorAll("button")].filter(
      (button) => button.getClientRects().length,
    );
  const box = hub.getBoundingClientRect();
  const manual = [
      ...active.querySelectorAll(".backup-manual .backup-action-grid > button"),
    ],
    manualBoxes = manual.map((button) => button.getBoundingClientRect()),
    reset = active.querySelector("details.backup-reset");
  return {
    viewport: innerWidth,
    tabCount: tabs.length,
    scopes:
      tabs.map((tab) => tab.dataset.backupTab).join(",") === "school,bank",
    relationships: tabs.every((tab) => {
      const panel = document.getElementById(tab.getAttribute("aria-controls")),
        current = tab === selected;
      return (
        panel?.getAttribute("role") === "tabpanel" &&
        panel.getAttribute("aria-labelledby") === tab.id &&
        tab.tabIndex === (current ? 0 : -1) &&
        panel.hidden === !current &&
        panel.inert === !current
      );
    }),
    active: active.id,
    contained:
      box.left >= -1 &&
      box.right <= innerWidth + 1 &&
      hub.scrollWidth <= hub.clientWidth + 1 &&
      active.scrollWidth <= active.clientWidth + 1 &&
      document.documentElement.scrollWidth <= innerWidth + 1,
    targets: visibleButtons.every((button) => {
      const rect = button.getBoundingClientRect();
      return (
        rect.height >= 44 &&
        rect.width >= 44 &&
        button.scrollWidth <= button.clientWidth + 1 &&
        rect.left >= -1 &&
        rect.right <= innerWidth + 1
      );
    }),
    exclusive:
      hub.querySelectorAll('[role="tabpanel"]:not([hidden])').length === 1,
    manualContract:
      manual.length === 3 &&
      manual.map((button) => button.textContent.trim()).join("|") ===
        "دریافت فایل|ارسال فایل|بازیابی فایل" &&
      manualBoxes.every(
        (box) =>
          Math.abs(box.top - manualBoxes[0].top) < 1 &&
          Math.abs(box.width - manualBoxes[0].width) < 1,
      ),
    independentReset:
      !!reset &&
      reset.compareDocumentPosition(active.querySelector(".backup-automatic")) &
        Node.DOCUMENT_POSITION_PRECEDING &&
      !!reset.querySelector("button"),
  };
}

function inspectHubAppearance() {
  const panel = document.querySelector(
      '#backupHub [role="tabpanel"]:not([hidden])',
    ),
    manual = panel.querySelector(".backup-manual"),
    automatic = panel.querySelector("details.backup-automatic"),
    summary = automatic.querySelector("summary"),
    actions = [...automatic.querySelectorAll(".row > button")],
    cardProperties = [
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderTopColor",
      "borderTopLeftRadius",
      "backgroundColor",
    ],
    styles = (node, properties) => {
      const computed = getComputedStyle(node);
      return properties.map((property) => computed[property]);
    },
    bounds = actions.map((button) => button.getBoundingClientRect());
  return {
    manual: styles(manual, cardProperties),
    heading: styles(manual.querySelector("h4"), ["fontSize", "lineHeight"]),
    automatic: styles(automatic, cardProperties),
    summary: styles(summary, ["fontSize", "lineHeight", "minHeight"]),
    controls: actions.map((button) =>
      styles(button, ["fontSize", "lineHeight", "minHeight", "borderRadius"]),
    ),
    // Compare every descendant, not only the outer card. The previous shallow
    // assertion could pass despite different filename rows, notices and icons.
    automaticTree: inspectAutomaticTree(automatic),
    compact:
      bounds.length === 3 &&
      bounds.every(
        (rect) =>
          Math.abs(rect.top - bounds[0].top) < 1 &&
          Math.abs(rect.width - bounds[0].width) < 1 &&
          rect.height >= 44 &&
          rect.height <= (innerWidth <= 600 ? 54 : 50),
      ),
  };
}

function inspectAutomaticTree(automatic) {
  const origin = automatic.getBoundingClientRect(),
    normalize = (value) =>
      String(value)
        .replaceAll("بانک سؤال و آزمون‌ها", "[scope]")
        .replaceAll("اطلاعات مدرسه", "[scope]")
        .replaceAll("singleFile", "automaticFile")
        .replaceAll("questionBankFile", "automaticFile"),
    computed = (node, pseudo) => {
      const style = getComputedStyle(node, pseudo);
      return Object.fromEntries(
        [...style]
          .filter((property) => !property.startsWith("--"))
          .map((property) => [property, style.getPropertyValue(property)]),
      );
    },
    attributes = (node) =>
      Object.fromEntries(
        [...node.attributes]
          .filter(
            ({ name }) =>
              name !== "id" &&
              name !== "data-state" &&
              name !== "data-workspace-action" &&
              !name.startsWith("data-qb-file"),
          )
          .map(({ name, value }) => [
            name,
            name === "class"
              ? value
                  .split(/\s+/)
                  .filter((token) => !token.startsWith("qb-"))
                  .sort()
                  .join(" ")
              : normalize(value),
          ])
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    round = (value) => Math.round(value * 1000) / 1000,
    walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        return text ? { text: normalize(text) } : null;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const rect = node.getBoundingClientRect();
      return {
        tag: node.localName,
        attributes: attributes(node),
        // Include all computed CSS, including typography, all border sides,
        // spacing, grid tracks, color, visibility and icon dimensions.
        style: computed(node),
        before: computed(node, "::before"),
        after: computed(node, "::after"),
        // display:none nodes have no box, so subtracting the card's position
        // from their synthetic zero rectangle would invent a false offset.
        geometry: node.getClientRects().length
          ? {
              x: round(rect.left - origin.left),
              y: round(rect.top - origin.top),
              width: round(rect.width),
              height: round(rect.height),
            }
          : null,
        children: [...node.childNodes].map(walk).filter(Boolean),
      };
    };
  return walk(automatic);
}

function appearanceDifferences(school, bank) {
  const differences = [];
  const compare = (a, b, location = "automatic") => {
    if (differences.length >= 12 || JSON.stringify(a) === JSON.stringify(b))
      return;
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        compare(a[key], b[key], location + "." + key);
    } else differences.push({ location, school: a, bank: b });
  };
  compare(school, bank);
  return differences;
}

async function inspectRetiredAutomaticPicker(scope) {
  const {
    __hubSchoolConnection,
    __hubTick,
    __hubStableSchool,
    __hubSameSchoolConnection,
  } = window;
  const picker = window.showSaveFilePicker,
    directory = await navigator.storage.getDirectory(),
    prefix =
      scope === "school" ? "Classyar-Classroom" : "Classyar-QuestionBank",
    priorHandle = await directory.getFileHandle(prefix + "(901).json", {
      create: true,
    }),
    metrics = { pickers: 0, reads: 0, streams: 0, writes: 0, closes: 0 };
  let release,
    lateText = "";
  const lateHandle = {
    kind: "file",
    name: prefix + "(902).json",
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    isSameEntry: async () => false,
    getFile: async () => {
      metrics.reads++;
      return new File([lateText], lateHandle.name, {
        type: "application/json",
      });
    },
    createWritable: async () => {
      metrics.streams++;
      let pending = lateText;
      return {
        write: async (value) => {
          metrics.writes++;
          pending = value;
        },
        close: async () => {
          metrics.closes++;
          lateText = pending;
        },
        abort: async () => {},
      };
    },
  };
  const connection = () =>
      scope === "school"
        ? __hubSchoolConnection()
        : EduQuestionBankRepository.readBackup(),
    handleMatches = async (config) =>
      !!config?.savedAt &&
      !!config.handle &&
      (await config.handle.isSameEntry(priorHandle)),
    choose = () => {
      const panel = document.getElementById(
        scope === "school" ? "backupSchoolPanel" : "backupBankPanel",
      );
      const automatic = panel.querySelector("details.backup-automatic");
      if (!automatic.open) automatic.querySelector("summary").click();
      const button = panel.querySelector(
        scope === "school"
          ? '[data-workspace-action="single-file-choose"]'
          : ".qb-file-choose",
      );
      if (button.disabled) throw Error("Automatic picker control is disabled");
      button.click();
    };
  try {
    closeModal();
    await __hubTick();
    await EduV24.openBackups({ tab: scope });
    window.showSaveFilePicker = async () => priorHandle;
    choose();
    let attached = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await handleMatches(await connection())) {
        attached = true;
        break;
      }
      await __hubTick();
    }
    if (!attached) throw Error("Prior automatic file did not become connected");
    const priorText = await (await priorHandle.getFile()).text(),
      schoolBefore = await __hubSchoolConnection(),
      bankBefore = await EduQuestionBankRepository.readBackup(),
      schoolData = await __hubStableSchool(),
      bankData = JSON.stringify(await EduQuestionBankRepository.read());
    window.showSaveFilePicker = () => {
      metrics.pickers++;
      return new Promise((resolve) => (release = resolve));
    };
    choose();
    if (!release || metrics.pickers !== 1)
      throw Error("The real choose click did not enter the delayed picker");
    const away = scope === "school" ? "bank" : "school";
    document
      .querySelector('#backupHub [data-backup-tab="' + away + '"]')
      .click();
    await __hubTick();
    document
      .querySelector('#backupHub [data-backup-tab="' + scope + '"]')
      .click();
    await __hubTick();
    release(lateHandle);
    // A stale selection must stop immediately after the picker resolves,
    // before even reading its returned file or starting asynchronous storage.
    await __hubTick();
    await __hubTick();
    const bankAfter = await EduQuestionBankRepository.readBackup();
    return {
      ...metrics,
      returnedToScope:
        document
          .querySelector('#backupHub [data-backup-tab="' + scope + '"]')
          .getAttribute("aria-selected") === "true",
      schoolConnectionUnchanged: await __hubSameSchoolConnection(schoolBefore),
      bankConnectionUnchanged:
        JSON.stringify(bankAfter) === JSON.stringify(bankBefore) &&
        (!bankBefore?.handle ||
          (await bankBefore.handle.isSameEntry(bankAfter.handle))),
      priorFileUnchanged:
        (await (await priorHandle.getFile()).text()) === priorText,
      lateFileUnchanged: lateText === "",
      schoolDataUnchanged: (await __hubStableSchool()) === schoolData,
      bankDataUnchanged:
        JSON.stringify(await EduQuestionBankRepository.read()) === bankData,
    };
  } finally {
    window.showSaveFilePicker = picker;
  }
}

main({
  stage: "unified-backup-hub",
  async runExtra({ cdp, evaluate, cases, root, delay }) {
    await require("./browser-ready.cjs")({ cdp, evaluate, delay });
    const out = path.join(root, ".cache", "unified-backup-audit");
    fs.mkdirSync(out, { recursive: true });
    const check = (name, pass, observed = {}) => {
      cases.push({ name: "unified backup: " + name, pass: !!pass, observed });
      if (!pass) throw Error(name + ": " + JSON.stringify(observed));
    };
    const waitFor = async (expression) => {
      for (let attempt = 0; attempt < 120; attempt++) {
        if (await evaluate(expression)) return;
        await delay(25);
      }
      throw Error("Unified backup regression timed out: " + expression);
    };
    const evaluateGesture = async (expression) => {
      const result = await cdp("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (result.exceptionDetails)
        throw Error(
          result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text,
        );
      return result.result.value;
    };
    const selectTab = async (scope) => {
      await evaluate(
        `(()=>{const tab=document.querySelector('#backupHub [data-backup-tab="${scope}"]');tab.focus();tab.click();})()`,
      );
      await waitFor(
        `document.querySelector('#backupHub [data-backup-tab="${scope}"]').getAttribute('aria-selected')==='true'`,
      );
      if (scope === "bank")
        await waitFor(
          `!!document.querySelector('#backupBankPanel .qb-backup-manual input[type=file]')`,
        );
    };
    await waitFor(
      "!!globalThis.EduQuestionBank && !!globalThis.EduQuestionBankRepository && !!globalThis.EduQuestionBankBackupUI && !!globalThis.EduBackupAutomaticView",
    );
    await evaluate(`(async()=>{
      closeModal();goSchools();
      window.__hubTick=()=>new Promise(resolve=>setTimeout(resolve,30));
      window.__hubBankInput=(file,read)=>{
        const input=document.querySelector('#backupBankPanel input[type=file]');
        const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;
        if(read)Object.defineProperty(input.files[0],'text',{value:read});
        input.dispatchEvent(new Event('change',{bubbles:true}));
      };
      window.__hubStableSchool=async()=>{
        const snapshot=await EduV24.snapshotInstallation();
        return JSON.stringify({stores:snapshot.stores,reportDrafts:snapshot.reportDrafts,gradeDrafts:snapshot.gradeDrafts});
      };
      window.__hubSchoolConnection=()=>new Promise((resolve,reject)=>{
        const tx=EduV24.test.getConnection().transaction('drafts'),request=tx.objectStore('drafts').get('EduManager.singleFile');
        tx.oncomplete=()=>resolve(request.result||null);tx.onabort=()=>reject(tx.error);
      });
      window.__hubSameSchoolConnection=async(before)=>{
        const after=await __hubSchoolConnection();
        return JSON.stringify(before)===JSON.stringify(after)&&(!before?.handle||await before.handle.isSameEntry(after.handle));
      };
      window.__hubOpenClear=async()=>{
        const details=document.querySelector('#backupBankPanel details.qb-backup-reset');
        if(!details.open)details.querySelector('summary').click();
        details.querySelector('.qb-backup-clear-entry').click();
        for(let i=0;i<100&&!document.querySelector('.qb-backup-confirm');i++)await __hubTick();
        const form=document.querySelector('.qb-backup-confirm form')||document.querySelector('form.qb-backup-confirm');
        if(!form)throw Error('The independent bank clear confirmation form is missing');
        return form;
      };
      window.__hubClearFields=(form,value,checked)=>{
        const typed=form.querySelector('input[type=text]'),ack=form.querySelector('[data-qb-clear-backup]');
        typed.value=value;typed.dispatchEvent(new Event('input',{bubbles:true}));
        ack.checked=checked;ack.dispatchEvent(new Event('change',{bubbles:true}));
      };
      window.__hubTestIncoming=EduQuestionBank.empty();
      __hubTestIncoming.courses=[{id:'hub-isolated-course',title:'بانک مستقل آزمایشی',structure:'chapter'}];
      window.__hubBankFile=()=>new File([EduQuestionBank.size(__hubTestIncoming)],'Classyar-QuestionBank.json',{type:'application/json'});
      await EduV24.openBackups();
    })()`);
    check(
      "school context opens the school panel in the main content page without a modal",
      await evaluate(`(()=>{
        const hub=document.getElementById('backupHub');
        return !!hub&&hub.closest('#app')&&!hub.closest('#modalBody')&&document.getElementById('modal').classList.contains('hidden')
          &&hub.querySelector('[data-backup-tab=school]').getAttribute('aria-selected')==='true'
          &&!!hub.querySelector('#backupSchoolPanel .backup-manual')
          &&!!document.querySelector('.header-actions [data-workspace-action=backups]');
      })()`),
    );
    check(
      "school sharing stays inside its tab and sends only its verified school file on the second click",
      await evaluateGesture(`(async()=>{
        const hub=document.getElementById('backupHub'),bank=JSON.stringify(await EduQuestionBankRepository.read());
        const descriptors=Object.fromEntries(['share','canShare'].map(key=>[key,Object.getOwnPropertyDescriptor(navigator,key)]));
        let calls=0,payload;
        Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
        Object.defineProperty(navigator,'share',{configurable:true,value:value=>{calls++;payload=value;return Promise.reject(new DOMException('cancelled','AbortError'));}});
        try{
          document.querySelector('#backupSchoolPanel .backup-share-entry').click();
          for(let i=0;i<100&&!document.querySelector('#backupSchoolPanel [data-workspace-action=share-backup-file]:not([disabled])');i++)await __hubTick();
          const panel=document.querySelector('#backupSchoolPanel #backupSharePanel');
          if(!panel||!hub.isConnected||calls!==0)return false;
          panel.querySelector('[data-workspace-action=share-backup-file]').click();await __hubTick();
          const file=payload?.files?.[0];
          const passed=calls===1&&file.name==='Classyar-Classroom.txt'&&JSON.parse(await file.text()).format==='EduManager.FullBackup'
            &&bank===JSON.stringify(await EduQuestionBankRepository.read());
          panel.querySelector('[data-workspace-action=close-backup-share]').click();
          return passed&&!document.querySelector('#backupSharePanel')&&hub.isConnected;
        }finally{for(const [key,descriptor] of Object.entries(descriptors)){if(descriptor)Object.defineProperty(navigator,key,descriptor);else delete navigator[key];}}
      })()`),
    );
    await selectTab("bank");
    const inactiveDisclosure = await evaluate(`(()=>{
      const panel=document.getElementById('backupBankPanel'),details=panel.querySelector('details.backup-automatic.qb-backup-automatic');
      return {
        state:EduQuestionBankFileBackup.service.state().state,
        manual:!!panel.querySelector('.backup-manual.qb-backup-manual .backup-action-grid'),
        details:!!details,
        open:!!details&&details.open,
        heading:details?.querySelector('summary > span')?.textContent,
        optional:details?.querySelector('summary > small')?.textContent,
        visibleActions:!!details&&[...details.querySelectorAll('.qb-file-actions button')].every(button=>button.checkVisibility()),
        metadata:!!details?.querySelector('.backup-connection[data-state=inactive]')&&details.querySelectorAll('.backup-file-details dt').length===3,
        noConnection:details?.querySelector('.qb-file-save')?.disabled&&details?.querySelector('.qb-file-stop')?.disabled
      };
    })()`);
    check(
      "inactive bank backup exposes its three automatic actions, disconnected state and complete file metadata",
      inactiveDisclosure.state === "inactive" &&
        inactiveDisclosure.manual &&
        inactiveDisclosure.details &&
        inactiveDisclosure.open &&
        inactiveDisclosure.heading === "ذخیره خودکار" &&
        inactiveDisclosure.optional === "اختیاری" &&
        inactiveDisclosure.visibleActions &&
        inactiveDisclosure.metadata &&
        inactiveDisclosure.noConnection,
      inactiveDisclosure,
    );
    // Let the dialog's initial focus pass finish before exercising native keys.
    await delay(100);
    await evaluate(
      `document.querySelector('#backupBankPanel details.backup-automatic > summary').focus()`,
    );
    check(
      "the optional automatic disclosure is keyboard focusable",
      await evaluate(
        `document.activeElement===document.querySelector('#backupBankPanel details.backup-automatic > summary')`,
      ),
    );
    for (const [key, code, expectedOpen] of [
      ["Enter", 13, false],
      [" ", 32, true],
    ]) {
      await cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        code: key === "Enter" ? "Enter" : "Space",
        windowsVirtualKeyCode: code,
        text: key === "Enter" ? "\r" : " ",
      });
      await cdp("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: key === "Enter" ? "Enter" : "Space",
        windowsVirtualKeyCode: code,
      });
      await delay(30);
      check(
        `native automatic disclosure ${expectedOpen ? "opens" : "closes"} from the keyboard`,
        await evaluate(
          `document.querySelector('#backupBankPanel details.backup-automatic').open===${expectedOpen}`,
        ),
      );
    }
    check(
      "preparing a bank share never sends automatically and its explicit second click sends only bank JSON as UTF-8 TXT",
      await evaluateGesture(`(async()=>{
        const before=await EduQuestionBankRepository.read(),school=await __hubStableSchool();
        const descriptors=Object.fromEntries(['share','canShare'].map(key=>[key,Object.getOwnPropertyDescriptor(navigator,key)]));
        let calls=0,payload,active=false;
        Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>files.length===1&&files[0].name==='Classyar-QuestionBank.txt'});
        Object.defineProperty(navigator,'share',{configurable:true,value:details=>{calls++;payload=details;active=navigator.userActivation.isActive;return Promise.reject(new DOMException('cancelled','AbortError'));}});
        try{
          document.querySelector('.qb-backup-share-entry').click();
          for(let i=0;i<100&&!document.querySelector('[data-qb-share-send]:not([disabled]):not([hidden])');i++)await __hubTick();
          const panel=document.querySelector('.qb-backup-share'),send=panel?.querySelector('[data-qb-share-send]');
          if(!panel||!send||send.disabled||send.hidden||calls!==0)return false;
          send.click();await __hubTick();
          const shared=payload?.files?.[0];
          return calls===1&&active&&shared?.name==='Classyar-QuestionBank.txt'&&shared.type==='text/plain'
            &&JSON.stringify(EduQuestionBank.parse(await shared.text()))===JSON.stringify(before)
            &&JSON.stringify(await EduQuestionBankRepository.read())===JSON.stringify(before)
            &&await __hubStableSchool()===school&&!!panel.querySelector('[data-qb-share-download]')
            &&!send.disabled;
        }finally{
          document.querySelector('[data-qb-share-close]')?.click();
          for(const [key,descriptor] of Object.entries(descriptors)){if(descriptor)Object.defineProperty(navigator,key,descriptor);else delete navigator[key];}
        }
      })()`),
    );
    check(
      "unsupported direct sharing retains a verified JSON download without changing either database",
      await evaluate(`(async()=>{
        const bank=JSON.stringify(await EduQuestionBankRepository.read()),school=await __hubStableSchool();
        const descriptor=Object.getOwnPropertyDescriptor(navigator,'canShare'),create=URL.createObjectURL,anchor=HTMLAnchorElement.prototype.click;
        let blob,name;
        Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});
        URL.createObjectURL=value=>{blob=value;return create.call(URL,value);};
        HTMLAnchorElement.prototype.click=function(){name=this.download;};
        try{
          document.querySelector('.qb-backup-share-entry').click();
          for(let i=0;i<100&&!document.querySelector('[data-qb-share-download]:not([disabled]):not([hidden])');i++)await __hubTick();
          const panel=document.querySelector('.qb-backup-share'),send=panel?.querySelector('[data-qb-share-send]'),download=panel?.querySelector('[data-qb-share-download]');
          if(!panel||send&&!send.hidden||!download||download.disabled||download.hidden)return false;
          download.click();await __hubTick();
          return name==='Classyar-QuestionBank.json'&&blob?.type==='application/json'
            &&JSON.stringify(EduQuestionBank.parse(await blob.text()))===bank
            &&JSON.stringify(await EduQuestionBankRepository.read())===bank&&await __hubStableSchool()===school;
        }finally{
          document.querySelector('[data-qb-share-close]')?.click();URL.createObjectURL=create;HTMLAnchorElement.prototype.click=anchor;
          if(descriptor)Object.defineProperty(navigator,'canShare',descriptor);else delete navigator.canShare;
        }
      })()`),
    );
    check(
      "a stale or retired prepared bank share cannot send a snapshot from before the latest revision or after changing tabs",
      await evaluateGesture(`(async()=>{
        const descriptors=Object.fromEntries(['share','canShare'].map(key=>[key,Object.getOwnPropertyDescriptor(navigator,key)]));
        let calls=0;
        Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
        Object.defineProperty(navigator,'share',{configurable:true,value:()=>{calls++;return Promise.resolve();}});
        try{
          document.querySelector('.qb-backup-share-entry').click();
          for(let i=0;i<100&&!document.querySelector('[data-qb-share-send]:not([disabled]):not([hidden])');i++)await __hubTick();
          const bank=await EduQuestionBankRepository.read();
          const changed=await EduQuestionBankRepository.save({...bank,courses:[...bank.courses,{id:'hub-share-new-course',title:'درس پس از تهیه فایل',structure:'chapter'}]},bank.revision);
          document.querySelector('[data-qb-share-send]').click();await __hubTick();
          if(calls!==0||JSON.stringify(await EduQuestionBankRepository.read())!==JSON.stringify(changed))return false;
          document.querySelector('[data-qb-share-prepare]').click();
          for(let i=0;i<100&&document.querySelector('[data-qb-share-send]')?.disabled;i++)await __hubTick();
          const retired=document.querySelector('[data-qb-share-send]');
          if(!retired||retired.disabled||retired.hidden)return false;
          document.querySelector('#backupHub [data-backup-tab=school]').click();await __hubTick();retired.click();await __hubTick();
          return calls===0&&!document.querySelector('.qb-backup-share')&&JSON.stringify(await EduQuestionBankRepository.read())===JSON.stringify(changed);
        }finally{
          for(const [key,descriptor] of Object.entries(descriptors)){if(descriptor)Object.defineProperty(navigator,key,descriptor);else delete navigator[key];}
          document.querySelector('#backupHub [data-backup-tab=bank]').click();await __hubTick();
        }
      })()`),
    );
    check(
      "shared TXT files are restorable only with the bank basename and valid bank content, and cancelling their preview changes neither scope",
      await evaluate(`(async()=>{
        const bank=JSON.stringify(await EduQuestionBankRepository.read()),school=await __hubStableSchool();
        const input=document.querySelector('#backupBankPanel input[type=file]');
        if(!input.accept.includes('.txt'))return false;
        for(const [name,text] of [['Classyar-Classroom.txt',EduQuestionBank.size(__hubTestIncoming)],['Classyar-QuestionBank.txt',JSON.stringify(await EduV24.snapshotInstallation())]]){
          __hubBankInput(new File([text],name,{type:'text/plain'}));await __hubTick();
          if(document.querySelector('.qb-backup-confirm')||JSON.stringify(await EduQuestionBankRepository.read())!==bank)return false;
        }
        __hubBankInput(new File([EduQuestionBank.size(__hubTestIncoming)],'Classyar-QuestionBank.txt',{type:'text/plain'}));
        for(let i=0;i<100&&!document.querySelector('.qb-backup-confirm');i++)await __hubTick();
        const box=document.querySelector('.qb-backup-confirm');if(!box)return false;
        const named=box.textContent.includes('Classyar-QuestionBank.txt');
        [...box.querySelectorAll('button')].find(button=>button.textContent==='انصراف').click();await __hubTick();
        return named&&!document.querySelector('.qb-backup-confirm')&&JSON.stringify(await EduQuestionBankRepository.read())===bank&&await __hubStableSchool()===school;
      })()`),
    );
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: width === 320 ? 640 : 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const appearance = {};
      for (const scope of ["school", "bank"]) {
        await selectTab(scope);
        if (scope === "bank") {
          const closedShot = await cdp("Page.captureScreenshot", {
            format: "png",
          });
          fs.writeFileSync(
            path.join(out, `bank-closed-${width}.png`),
            Buffer.from(closedShot.data, "base64"),
          );
        }
        await evaluate(
          `document.querySelectorAll('#backupHub [role=tabpanel]:not([hidden]) details').forEach(details=>{if(!details.open)details.querySelector('summary').click();})`,
        );
        await delay(60);
        appearance[scope] = await evaluate(
          `(()=>{const inspectAutomaticTree=${inspectAutomaticTree.toString()};return (${inspectHubAppearance.toString()})();})()`,
        );
        const observed = await evaluate(
          "(" + inspectHubLayout.toString() + ")()",
        );
        check(
          `two scoped panels and touch-sized controls fit ${scope} ${width}`,
          observed.tabCount === 2 &&
            [
              "scopes",
              "relationships",
              "contained",
              "targets",
              "exclusive",
              "manualContract",
              "independentReset",
            ].every((key) => observed[key]),
          observed,
        );
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(
          path.join(out, `${scope}-${width}.png`),
          Buffer.from(shot.data, "base64"),
        );
      }
      const differences = appearanceDifferences(
        appearance.school,
        appearance.bank,
      );
      check(
        `bank matches every school automatic descendant, style, icon and layout at ${width}`,
        appearance.school.compact &&
          appearance.bank.compact &&
          differences.length === 0,
        {
          schoolCompact: appearance.school.compact,
          bankCompact: appearance.bank.compact,
          differences,
        },
      );
    }
    // Exercise the shared presentation in each real adapter's DOM context.
    // These inert view fixtures never invoke a repository, file picker or
    // permission request. Equal inputs must produce equal output at every
    // descendant, even when a status notice or permission action is visible.
    for (const width of [320, 390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const matrix = await evaluate(`(async()=>{
        const inspectAutomaticTree=${inspectAutomaticTree.toString()};
        const appearanceDifferences=${appearanceDifferences.toString()};
        const panels=['school','bank'].map(scope=>document.getElementById(scope==='school'?'backupSchoolPanel':'backupBankPanel'));
        const previous=panels.map(panel=>({hidden:panel.hidden,inert:panel.inert}));
        const originals=panels.map(panel=>panel.querySelector('details.backup-automatic'));
        const sleep=()=>new Promise(resolve=>setTimeout(resolve,80));
        const name='Classyar-QuestionBank (1234567890123456789012345678901234567890).json';
        const savedAt='2026-11-17T08:30:00.000Z';
        const states=[
          {key:'inactive',name:'',savedAt:'',message:'ذخیره خودکار در فایل هنوز فعال نیست.'},
          {key:'active',name,savedAt,message:'ذخیره شد.',noticeHidden:true},
          {key:'permission',name,savedAt,message:'مجوز فایل نیاز به تأیید دارد.',permission:true,needsReview:true},
          {key:'error',name,savedAt,message:'فایل به‌روز نشد؛ پشتیبان دستی بگیرید.',fallback:true,needsReview:true},
          {key:'paused',name,savedAt:'invalid',message:'تأیید جایگزینی لازم است.',fallback:true,needsReview:true},
          {key:'unsupported',supported:false,name:'',savedAt:'',message:'ذخیرهٔ خودکار در این مرورگر در دسترس نیست؛ از «دریافت فایل» استفاده کنید.'},
          {key:'busy',name,savedAt,message:'در حال ذخیره‌سازی.',busy:true}
        ];
        const results=[];
        try{
          for(const state of states){
            const fixtures=panels.map((panel,index)=>{
              const bank=index===1,purpose='اطلاعات آزمایشی';
              const attributes=action=>bank?{['data-qb-file-'+action]:''}:{'data-workspace-action':'single-file-'+action};
              const html=EduBackupAutomaticView.html({
                ...state,supported:state.supported!==false,open:true,purpose,
                ids:{summary:bank?'questionBankFileSummary':'singleFileSummary',status:bank?'questionBankFileStatus':'singleFileStatus',fallback:bank?'questionBankFileFallback':'singleFileFallback'},
                className:bank?'qb-backup-automatic':'',
                aliases:bank?{summary:'qb-file-summary',status:'qb-file-status',actions:'qb-file-actions',choose:'qb-file-choose',save:'qb-file-save',stop:'qb-file-stop',fallback:'qb-file-fallback'}:{},
                actions:Object.fromEntries(['choose','save','stop'].map(action=>[action,attributes(action)])),
                disabled:Object.fromEntries(['choose','save','stop'].map(action=>[action,!!state.busy])),
                permission:state.permission?{attributes:bank?{'data-qb-file-permission':''}:{'data-workspace-action':'single-file-save'},ariaLabel:'اجازه مجدد برای فایل '+purpose+': '+name}:null
              });
              const template=document.createElement('template');template.innerHTML=html;
              const node=template.content.firstElementChild;
              originals[index].replaceWith(node);
              return node;
            });
            try{
              await sleep();
              const snapshots=[];let fits=true;
              for(let index=0;index<panels.length;index++){
                panels.forEach((panel,i)=>{panel.hidden=i!==index;panel.inert=i!==index;});
                await sleep();
                snapshots.push(inspectAutomaticTree(fixtures[index]));
                fits&&=fixtures[index].scrollWidth<=fixtures[index].clientWidth+1;
                fits&&=[...fixtures[index].querySelectorAll('button')].filter(node=>node.checkVisibility()).every(node=>{
                  const rect=node.getBoundingClientRect();
                  return rect.height>=44&&rect.width>=44&&rect.left>=-1&&rect.right<=innerWidth+1&&node.scrollWidth<=node.clientWidth+1;
                });
              }
              const differences=appearanceDifferences(snapshots[0],snapshots[1]);
              results.push({state:state.key,pass:fits&&!differences.length,fits,differences});
            }finally{fixtures.forEach((node,index)=>node.replaceWith(originals[index]));}
          }
        }finally{panels.forEach((panel,index)=>{panel.hidden=previous[index].hidden;panel.inert=previous[index].inert;});}
        return results;
      })()`);
      for (const observed of matrix)
        check(
          `exact automatic DOM, all computed CSS, icons and touch layout for ${observed.state} at ${width}`,
          observed.pass,
          observed,
        );
    }
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await selectTab("school");
    await evaluate(
      `document.querySelector('#backupHub [data-backup-tab=school]').focus()`,
    );
    for (const [key, code, scope] of [
      ["End", 35, "bank"],
      ["Home", 36, "school"],
      ["ArrowLeft", 37, "bank"],
      ["ArrowRight", 39, "school"],
    ]) {
      await cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        windowsVirtualKeyCode: code,
      });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", key });
      await delay(30);
      check(
        `${key} activates and focuses the ${scope} tab`,
        await evaluate(
          `document.activeElement===document.querySelector('#backupHub [data-backup-tab=${scope}]')&&document.activeElement.getAttribute('aria-selected')==='true'`,
        ),
      );
    }
    check(
      "bank-page context opens the same hub on the bank panel without an internal backup tab",
      await evaluate(`(async()=>{
        closeModal();await __hubTick();await EduQuestionBankUI.open();
        const tabs=[...document.querySelectorAll('.qb-page .qb-tabs button')];
        const singleEntry=tabs.length===3&&!tabs.some(tab=>tab.textContent==='پشتیبان');
        await EduV24.openBackups();
        return singleEntry&&document.querySelector('#backupHub [data-backup-tab=bank]').getAttribute('aria-selected')==='true'
          &&!!document.querySelector('#backupBankPanel .qb-backup');
      })()`),
    );
    check(
      "explicit public scope selection overrides the current page context",
      await evaluate(`(async()=>{
        closeModal();await __hubTick();
        await EduV24.openBackups({tab:'school'});
        const school=document.querySelector('#backupHub [data-backup-tab=school]').getAttribute('aria-selected')==='true';
        closeModal();await __hubTick();goSchools();
        await EduV24.openBackups({tab:'bank'});
        return school&&document.querySelector('#backupHub [data-backup-tab=bank]').getAttribute('aria-selected')==='true';
      })()`),
    );
    check(
      "switching panels and navigating away dispose bank subscriptions and stale actions",
      await evaluate(`(async()=>{
        closeModal();await __hubTick();goSchools();
        const service=EduQuestionBankFileBackup.service;
        const subscribe=service.subscribe,choose=service.choose;
        let active=0,subscriptions=0,choices=0;
        service.subscribe=callback=>{
          subscriptions++;active++;const unsubscribe=subscribe.call(service,callback);let live=true;
          return()=>{if(live){live=false;active--;unsubscribe();}};
        };
        service.choose=()=>{choices++;return Promise.resolve(false);};
        try {
          await EduV24.openBackups();
          if(active!==0)throw Error('initial subscriptions '+active);
          document.querySelector('#backupHub [data-backup-tab=bank]').click();await __hubTick();
          const first=document.querySelector('#backupBankPanel .qb-file-actions button');
          if(active!==1)throw Error('expected mounted subscription '+active);
          document.querySelector('#backupHub [data-backup-tab=school]').click();await __hubTick();
          first.click();if(active!==0||choices!==0)throw Error('stale action '+JSON.stringify({active,choices}));
          document.querySelector('#backupHub [data-backup-tab=bank]').click();await __hubTick();
          const closed=document.querySelector('#backupBankPanel .qb-file-actions button');
          if(active!==1||document.querySelectorAll('#backupBankPanel .qb-backup').length!==1)return false;
          goSchools();await __hubTick();closed.click();if(active!==0||choices!==0)throw Error('stale action '+JSON.stringify({active,choices}));
          await EduV24.openBackups();document.querySelector('#backupHub [data-backup-tab=bank]').click();await __hubTick();
          const retired=document.querySelector('#backupBankPanel .qb-file-actions button');
          showModal('پنجرهٔ دیگر','<p id="hubReplacement">محتوای مستقل</p>');await __hubTick();
          if(active!==1)return false;
          closeModal();goReports();await __hubTick();
          retired.click();
          if(!(active===0&&subscriptions===3&&choices===0&&state.view==='reports'))throw Error('final '+JSON.stringify({active,subscriptions,choices,view:state.view}));return true;
        } finally {closeModal();await __hubTick();service.subscribe=subscribe;service.choose=choose;}
      })()`),
    );
    check(
      "closing during a bank file read cannot reopen a confirmation or mutate either data scope",
      await evaluate(`(async()=>{
        const school=await __hubStableSchool(),bank=JSON.stringify(await EduQuestionBankRepository.read());
        await EduV24.openBackups();document.querySelector('#backupHub [data-backup-tab=bank]').click();await __hubTick();
        let release,started=false;
        __hubBankInput(__hubBankFile(),()=>{started=true;return new Promise(resolve=>release=resolve);});
        await __hubTick();if(!started)return false;
        goSchools();await __hubTick();release(EduQuestionBank.size(__hubTestIncoming));await __hubTick();
        return document.getElementById('modal').classList.contains('hidden')
          &&!document.querySelector('.qb-backup-confirm')
          &&JSON.stringify(await EduQuestionBankRepository.read())===bank&&await __hubStableSchool()===school;
      })()`),
    );
    check(
      "closing during a school file read cannot reopen its restore preview or mutate either data scope",
      await evaluate(`(async()=>{
        const school=await __hubStableSchool(),bank=JSON.stringify(await EduQuestionBankRepository.read());
        const snapshot=await EduV24.snapshotInstallation(),input=document.getElementById('importFile'),click=input.click;
        let release,started=false;
        await EduV24.openBackups({tab:'school'});
        input.click=()=>{};
        try {
          document.querySelector('#backupSchoolPanel [data-workspace-action=choose-import]').click();
          const file=new File([JSON.stringify(snapshot)],'Classyar-Classroom.json',{type:'application/json'});
          const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;
          Object.defineProperty(input.files[0],'text',{value:()=>{started=true;return new Promise(resolve=>release=resolve);}});
          input.dispatchEvent(new Event('change',{bubbles:true}));await __hubTick();if(!started)return false;
          goSchools();await __hubTick();release(JSON.stringify(snapshot));await __hubTick();
          return document.getElementById('modal').classList.contains('hidden')
            &&!document.querySelector('.full-restore')
            &&JSON.stringify(await EduQuestionBankRepository.read())===bank&&await __hubStableSchool()===school;
        } finally {input.click=click;}
      })()`),
    );
    check(
      "a school file cannot be restored into the bank and neither scope changes",
      await evaluate(`(async()=>{
        const school=await __hubStableSchool(),bank=JSON.stringify(await EduQuestionBankRepository.read());
        await EduV24.openBackups();document.querySelector('#backupHub [data-backup-tab=bank]').click();await __hubTick();
        const snapshot=await EduV24.snapshotInstallation();
        __hubBankInput(new File([JSON.stringify(snapshot)],'Classyar-Classroom.json',{type:'application/json'}));await __hubTick();
        return !!document.querySelector('#backupBankPanel .qb-backup-message[role=alert]')
          &&!document.querySelector('.qb-backup-confirm')
          &&JSON.stringify(await EduQuestionBankRepository.read())===bank&&await __hubStableSchool()===school;
      })()`),
    );
    check(
      "switching away cancels a bank restore confirmation without changing either scope",
      await evaluate(`(async()=>{
        const school=await __hubStableSchool(),bank=JSON.stringify(await EduQuestionBankRepository.read());
        __hubBankInput(__hubBankFile());await __hubTick();
        const confirm=document.querySelector('.qb-backup-confirm');if(!confirm)return false;
        const submit=[...confirm.querySelectorAll('button')].find(button=>button.textContent==='تأیید');
        document.querySelector('#backupHub [data-backup-tab=school]').click();await __hubTick();submit.click();await __hubTick();
        return !document.querySelector('.qb-backup-confirm')
          &&JSON.stringify(await EduQuestionBankRepository.read())===bank&&await __hubStableSchool()===school;
      })()`),
    );
    await evaluate(
      "(async()=>{window.__hubBeforeConfirmedSchool=await __hubStableSchool();})()",
    );
    await selectTab("bank");
    await evaluate("__hubBankInput(__hubBankFile())");
    await waitFor("!!document.querySelector('.qb-backup-confirm')");
    await evaluate(`(()=>{
      const buttons=[...document.querySelectorAll('.qb-backup-confirm button')];
      buttons.find(button=>button.textContent==='تأیید').click();
    })()`);
    await waitFor(
      `(async()=>!!(await EduQuestionBankRepository.read()).courses.find(course=>course.id==='hub-isolated-course'))()`,
    );
    check(
      "confirmed bank restore replaces only its own bank, not school records",
      await evaluate(`(async()=>{
        return (await EduQuestionBankRepository.read()).courses.length===1
          &&!!document.querySelector('#backupBankPanel .qb-backup')
          &&await __hubStableSchool()===__hubBeforeConfirmedSchool;
      })()`),
    );
    check(
      "school restore leaves the independent bank intact",
      await evaluate(`(async()=>{
        closeModal();await __hubTick();
        const bank=JSON.stringify(await EduQuestionBankRepository.read()),snapshot=await EduV24.snapshotInstallation();
        EduV24.previewFullBackup(snapshot);document.getElementById('fullRestoreConfirmed').checked=true;
        await EduV24.restoreFullBackup();
        return JSON.stringify(await EduQuestionBankRepository.read())===bank;
      })()`),
    );
    check(
      "the independent bank clear form requires both its exact confirmation text and a backup acknowledgement",
      await evaluate(`(async()=>{
        closeModal();await __hubTick();await EduV24.openBackups({tab:'bank'});
        const before=JSON.stringify(await EduQuestionBankRepository.read()),school=await __hubStableSchool(),file=await EduQuestionBankRepository.readBackup();
        const form=await __hubOpenClear(),box=form.closest('.qb-backup-confirm');
        const scoped=box.textContent.includes('بانک سؤال')&&box.textContent.includes('مدرسه');
        for(const [text,checked] of [['',false],['حذف',false],['اشتباه',true]]){
          __hubClearFields(form,text,checked);form.requestSubmit();await __hubTick();
          if(!box.isConnected||JSON.stringify(await EduQuestionBankRepository.read())!==before)return false;
        }
        [...box.querySelectorAll('button')].find(button=>button.textContent==='انصراف').click();await __hubTick();
        return scoped&&!document.querySelector('.qb-backup-confirm')&&JSON.stringify(await EduQuestionBankRepository.read())===before
          &&JSON.stringify(await EduQuestionBankRepository.readBackup())===JSON.stringify(file)&&await __hubStableSchool()===school;
      })()`),
    );
    check(
      "switching tabs invalidates an already filled bank clear form and cannot delete data with a retired submit",
      await evaluate(`(async()=>{
        const before=JSON.stringify(await EduQuestionBankRepository.read()),school=await __hubStableSchool();
        const form=await __hubOpenClear();__hubClearFields(form,'حذف',true);
        document.querySelector('#backupHub [data-backup-tab=school]').click();await __hubTick();
        form.requestSubmit();await __hubTick();
        return !document.querySelector('.qb-backup-confirm')&&JSON.stringify(await EduQuestionBankRepository.read())===before&&await __hubStableSchool()===school;
      })()`),
    );
    check(
      "an intervening bank revision blocks clear instead of deleting newly saved work",
      await evaluate(`(async()=>{
        document.querySelector('#backupHub [data-backup-tab=bank]').click();await __hubTick();
        const before=await EduQuestionBankRepository.read(),school=await __hubStableSchool(),form=await __hubOpenClear();
        const changed=await EduQuestionBankRepository.save({...before,courses:[...before.courses,{id:'hub-concurrent-course',title:'ثبت هم‌زمان',structure:'chapter'}]},before.revision);
        __hubClearFields(form,'حذف',true);form.requestSubmit();
        for(let i=0;i<100&&!document.querySelector('.qb-backup-message[role=alert]');i++)await __hubTick();
        const unchanged=JSON.stringify(await EduQuestionBankRepository.read())===JSON.stringify(changed)&&await __hubStableSchool()===school;
        document.querySelector('.qb-backup-confirm button')?.click();
        return unchanged&&!!document.querySelector('.qb-backup-message[role=alert]');
      })()`),
    );
    for (const scope of ["school", "bank"]) {
      const retiredPicker = await evaluateGesture(
        "(" +
          inspectRetiredAutomaticPicker.toString() +
          ")(" +
          JSON.stringify(scope) +
          ")",
      );
      check(
        `${scope} automatic picker cannot resume after switching tabs away and back`,
        retiredPicker.pickers === 1 &&
          retiredPicker.reads === 0 &&
          retiredPicker.streams === 0 &&
          retiredPicker.writes === 0 &&
          retiredPicker.closes === 0 &&
          retiredPicker.returnedToScope &&
          retiredPicker.schoolConnectionUnchanged &&
          retiredPicker.bankConnectionUnchanged &&
          retiredPicker.priorFileUnchanged &&
          retiredPicker.lateFileUnchanged &&
          retiredPicker.schoolDataUnchanged &&
          retiredPicker.bankDataUnchanged,
        retiredPicker,
      );
    }
    check(
      "bank clear removes its native file and data, preserves the school file and connection, and refreshes the bank page",
      await evaluateGesture(`(async()=>{
        closeModal();await __hubTick();
        const directory=await navigator.storage.getDirectory(),picker=window.showSaveFilePicker;
        let schoolHandle,bankHandle;
        try{
          window.showSaveFilePicker=async(options)=>{
            const handle=await directory.getFileHandle(options.suggestedName,{create:true});
            if(options.suggestedName.startsWith('Classyar-QuestionBank'))bankHandle=handle;else schoolHandle=handle;
            return handle;
          };
          await EduV24.openBackups({tab:'school'});
          const automatic=document.querySelector('#backupSchoolPanel details.backup-automatic');
          if(!automatic.open)automatic.querySelector('summary').click();
          const previousSchool=await __hubSchoolConnection();
          document.querySelector('#backupSchoolPanel [data-workspace-action=single-file-choose]').click();
          let schoolAttached=false;
          for(let i=0;i<150;i++){
            const config=await __hubSchoolConnection();
            if(config?.savedAt&&schoolHandle&&config.connectionId!==previousSchool?.connectionId&&await config.handle.isSameEntry(schoolHandle)){schoolAttached=true;break;}
            await __hubTick();
          }
          const schoolConfig=await __hubSchoolConnection(),schoolTime=document.querySelector('#backupSchoolPanel #singleFileSummary time');
          if(!schoolAttached||!schoolTime||schoolTime.dateTime!==schoolConfig.savedAt||!/[۰-۹]/.test(schoolTime.textContent)||!schoolTime.textContent.includes(':'))return false;
          const schoolFile=await (await schoolHandle.getFile()).text();
          closeModal();await __hubTick();await EduQuestionBankUI.open();await EduV24.openBackups({tab:'bank'});
          const bankAuto=document.querySelector('#backupBankPanel details.backup-automatic');if(!bankAuto.open)bankAuto.querySelector('summary').click();
          const previousBank=await EduQuestionBankRepository.readBackup();
          document.querySelector('.qb-file-choose').click();
          let bankAttached=false;
          for(let i=0;i<150;i++){
            const config=await EduQuestionBankRepository.readBackup();
            if(config?.savedAt&&bankHandle&&config.id!==previousBank?.id&&await config.handle.isSameEntry(bankHandle)&&EduQuestionBankFileBackup.service.state().state==='active'){bankAttached=true;break;}
            await __hubTick();
          }
          if(!bankAttached)return false;
          const R=EduQuestionBankRepository,config=await R.readBackup(),before=await R.read(),school=await __hubStableSchool();
          const saved=await (await bankHandle.getFile()).text(),time=document.querySelector('.qb-file-summary time');
          if(!time||time.dateTime!==config.savedAt||!/[۰-۹]/.test(time.textContent)||!time.textContent.includes(':'))return false;
          let form=await __hubOpenClear();__hubClearFields(form,'حذف',true);
          [...form.querySelectorAll('button')].find(button=>button.textContent==='انصراف').click();await __hubTick();
          const kept=await R.readBackup();
          if(kept?.id!==config.id||!(await kept.handle.isSameEntry(bankHandle))||(await (await bankHandle.getFile()).text())!==saved)return false;
          form=await __hubOpenClear();__hubClearFields(form,'حذف',true);form.requestSubmit();
          let after;
          for(let i=0;i<150;i++){after=await R.read();if(after.revision>before.revision&&!document.querySelector('.qb-backup[aria-busy=true]'))break;await __hubTick();}
          let removed=false;try{await bankHandle.getFile();}catch(error){removed=error.name==='NotFoundError';}
          return after.revision===before.revision+1&&['courses','units','questions','exams'].every(key=>after[key].length===0)
            &&!(await R.readBackup())&&EduQuestionBankFileBackup.service.state().state==='inactive'
            &&removed
            &&await __hubStableSchool()===school&&await __hubSameSchoolConnection(schoolConfig)
            &&(await (await schoolHandle.getFile()).text())===schoolFile
            &&!document.querySelector('.qb-page .qb-question-row,.qb-page .qb-exam-card')
            &&!document.querySelector('.qb-backup-confirm');
        }finally{window.showSaveFilePicker=picker;}
      })()`),
    );
    check(
      "a connected bank keeps its filename and Persian last-save time visible without repeating a success status",
      await evaluateGesture(`(async()=>{
        const bank=await EduQuestionBankRepository.read();
        await EduQuestionBankRepository.save({...bank,courses:[{id:'hub-final-preview',title:'نمونهٔ تصویری نهایی',structure:'chapter'}]},bank.revision);
        const picker=window.showSaveFilePicker,directory=await navigator.storage.getDirectory();
        try{
          const previewHandle=await directory.getFileHandle('Classyar-QuestionBank(99).json',{create:true}),previous=await EduQuestionBankRepository.readBackup();
          window.showSaveFilePicker=async()=>previewHandle;
          document.querySelector('.qb-file-choose').click();
          let attached=false;
          for(let i=0;i<150;i++){
            const config=await EduQuestionBankRepository.readBackup();
            if(config?.savedAt&&config.id!==previous?.id&&await config.handle.isSameEntry(previewHandle)&&EduQuestionBankFileBackup.service.state().state==='active'){attached=true;break;}
            await __hubTick();
          }
          const saved=await EduQuestionBankRepository.readBackup(),time=document.querySelector('.qb-file-summary time'),name=document.querySelector('.qb-file-name');
          const automatic=document.querySelector('#backupBankPanel details.backup-automatic');if(!automatic.open)automatic.querySelector('summary').click();
          const reset=document.querySelector('#backupBankPanel details.backup-reset');if(reset.open)reset.querySelector('summary').click();
          return attached&&!!saved&&EduQuestionBankFileBackup.service.state().state==='active'&&name.textContent===saved.handle.name
            &&name.checkVisibility()&&time?.checkVisibility()&&time.dateTime===saved.savedAt
            &&document.querySelector('.qb-file-status').hidden;
        }finally{window.showSaveFilePicker=picker;}
      })()`),
    );
    await evaluate(`(async()=>{
      closeModal();await __hubTick();await EduV24.openBackups({tab:'bank'});
      const automatic=document.querySelector('#backupBankPanel details.backup-automatic');
      if(!automatic.open)automatic.querySelector('summary').click();
    })()`);
    for (const width of [390, 768, 1440]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate(`window.scrollTo(0,0)`);
      await delay(60);
      const activeShot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(out, `bank-active-final-${width}.png`),
        Buffer.from(activeShot.data, "base64"),
      );
      await evaluate(
        `(async()=>{await __hubOpenClear();window.scrollTo(0,0);})()`,
      );
      const confirmLayout = await evaluate(
        "(" + inspectHubLayout.toString() + ")()",
      );
      check(
        `typed bank clear confirmation fits and retains touch-sized controls at ${width}`,
        confirmLayout.contained && confirmLayout.targets,
        confirmLayout,
      );
      const clearShot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(out, `bank-clear-final-${width}.png`),
        Buffer.from(clearShot.data, "base64"),
      );
      await evaluate(
        `[...document.querySelectorAll('.qb-backup-confirm button')].find(button=>button.textContent==='انصراف').click()`,
      );
    }
    const beforeSchoolWipe = await evaluate(`(async()=>{
      const school=await __hubSchoolConnection(),bank=await EduQuestionBankRepository.readBackup();
      return {schoolName:school.handle.name,bankName:bank.handle.name,bank:JSON.stringify(await EduQuestionBankRepository.read()),bankFile:await (await bank.handle.getFile()).text()};
    })()`);
    await evaluateGesture(`(async()=>{
      closeModal();await __hubTick();await EduV24.openBackups({tab:'school'});
      document.querySelector('#backupSchoolPanel [data-workspace-action=open-wipe]').click();
      await __hubTick();
      if(!document.getElementById('wipeWarning')||!document.querySelector('.wipe-backup').textContent.includes(${JSON.stringify(beforeSchoolWipe.schoolName)}))throw Error('Wipe must name the exact school file');
      window.confirm=()=>true;
      document.getElementById('wipeText').value='حذف';document.getElementById('wipeBackup').checked=true;
      globalThis.__beforeScopedSchoolWipe=true;
      document.getElementById('wipeEditor').requestSubmit();
    })()`);
    let schoolWipeReloaded = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      await delay(100);
      try {
        schoolWipeReloaded = await evaluate(
          "!globalThis.__beforeScopedSchoolWipe && !!globalThis.EduV24?.getReportContext?.().ready",
        );
        if (schoolWipeReloaded) break;
      } catch (error) {
        if (
          !/Execution context was destroyed|Cannot find (?:default execution )?context|Inspected target navigated/i.test(
            error.message || String(error),
          )
        )
          throw error;
      }
    }
    check(
      "school deletion returns to a ready application after its own reset",
      schoolWipeReloaded,
    );
    check(
      "school wipe removes only its connected native file and school database while preserving the bank and its file",
      await evaluate(`(async()=>{
        const directory=await navigator.storage.getDirectory();
        let removed=false;try{await directory.getFileHandle(${JSON.stringify(beforeSchoolWipe.schoolName)});}catch(error){removed=error.name==='NotFoundError';}
        const handle=await directory.getFileHandle(${JSON.stringify(beforeSchoolWipe.bankName)});
        return removed&&db.schools.length===0&&JSON.stringify(await EduQuestionBankRepository.read())===${JSON.stringify(beforeSchoolWipe.bank)}
          &&await (await handle.getFile()).text()===${JSON.stringify(beforeSchoolWipe.bankFile)}&&!!(await EduQuestionBankRepository.readBackup());
      })()`),
    );
  },
}).catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 2;
});
