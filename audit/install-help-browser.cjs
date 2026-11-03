"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
async function run({ cdp, evaluate, cases, delay }) {
  const url = await evaluate("new URL('./',location.href).href"),
    shots = fs.mkdtempSync(path.join(os.tmpdir(), "edu-install-parity-"));
  const measure = () => {
    const body = document.querySelector(".offline-help"),
      dialog = body.closest("dialog,.modal-dialog"),
      bar = document.querySelector("#mobileBar,#deputyOfflineBar");
    const css = (node) => {
      const s = getComputedStyle(node);
      return Object.fromEntries(
        [
          "display",
          "padding",
          "gap",
          "fontSize",
          "fontWeight",
          "lineHeight",
          "color",
          "backgroundColor",
          "borderColor",
          "borderRadius",
          "boxShadow",
          "minHeight",
          "outline",
          "outlineOffset",
        ].map((k) => [k, s[k]]),
      );
    };
    const rect = dialog.getBoundingClientRect();
    return {
      backdrop:
        dialog.tagName === "DIALOG"
          ? getComputedStyle(dialog, "::backdrop").backgroundColor
          : getComputedStyle(document.getElementById("modal")).backgroundColor,
      bar: css(bar),
      install: css(bar.querySelector("[id$=Install]")),
      help: css(bar.querySelector("[id$=Help]")),
      installIcon: bar.querySelector("[id$=Install] svg").outerHTML,
      helpIcon: bar.querySelector("[id$=Help] svg").outerHTML,
      html: body.innerHTML,
      dialog: css(dialog),
      header: css(dialog.querySelector(".modal-header")),
      title: css(dialog.querySelector(".modal-header h3")),
      close: css(dialog.querySelector(".modal-header button")),
      section: css(body.querySelector("section")),
      paragraph: css(body.querySelector("p")),
      rows: [body, ...body.querySelectorAll("*")].map((node) => ({
        tag: node.tagName,
        cls: node.className,
        height: node.getBoundingClientRect().height,
        width: node.getBoundingClientRect().width,
        margin: getComputedStyle(node).margin,
        font: getComputedStyle(node).font,
        padding: getComputedStyle(node).padding,
      })),
      parts: [...dialog.children].map((node) => ({
        height: node.getBoundingClientRect().height,
        padding: getComputedStyle(node).padding,
        border: getComputedStyle(node).borderWidth,
        margin: getComputedStyle(node).margin,
        boxSizing: getComputedStyle(node).boxSizing,
      })),
      dimensions: {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      },
      overflow:
        body.scrollWidth > body.clientWidth + 1 ||
        document.documentElement.scrollWidth > innerWidth + 1,
    };
  };
  for (const width of [320, 390, 768, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 1000,
    });
    await cdp("Emulation.setTouchEmulationEnabled", {
      enabled: width < 1000,
      maxTouchPoints: width < 1000 ? 5 : 1,
    });
    const values = [];
    for (const role of ["teacher", "deputy"]) {
      await cdp("Page.navigate", {
        url: new URL(
          role === "teacher" ? "EduManager.html" : "Deputy.html",
          url,
        ).href,
      });
      for (let i = 0; i < 150; i++) {
        try {
          if (
            await evaluate(
              role === "teacher"
                ? "location.pathname.endsWith('/EduManager.html')&&!!globalThis.EduV24?.getReportContext().ready"
                : "location.pathname.endsWith('/Deputy.html')&&!!globalThis.EduDeputyUI?.status().ready",
            )
          )
            break;
        } catch {}
        await delay(100);
      }
      if (role === "teacher")
        await evaluate(
          "document.getElementById('pwaWelcomeLater')?.click();closeModal();goSchools()",
        );
      await evaluate("document.fonts.ready");
      await evaluate(
        "(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{};e.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(e);document.getElementById(" +
          JSON.stringify(role === "teacher" ? "mobileHelp" : "deputyHelp") +
          ").click()})()",
      );
      await delay(100);
      values.push(await evaluate("(" + measure.toString() + ")()"));
      const shot = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(
        path.join(shots, role + "-install-" + width + ".png"),
        Buffer.from(shot.data, "base64"),
      );
      if (role === "deputy") {
        await cdp("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        await cdp("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        cases.push({
          id: "HELP_ESCAPE_" + width,
          pass: await evaluate(
            "!document.getElementById('deputyInstallDialog').open",
          ),
        });
      }
    }
    for (const key of [
      "backdrop",
      "bar",
      "install",
      "help",
      "installIcon",
      "helpIcon",
      "html",
      "dialog",
      "header",
      "title",
      "close",
      "section",
      "paragraph",
      "rows",
      "parts",
      "dimensions",
    ])
      cases.push({
        id: "HELP_" + width + "_" + key,
        pass: JSON.stringify(values[0][key]) === JSON.stringify(values[1][key]),
        observed: values.map((v) => v[key]),
      });
    cases.push({
      id: "HELP_BOUNDS_" + width,
      pass: values.every((v) => !v.overflow),
      observed: { shots },
    });
  }
  const localMessages = [];
  for (const role of ["teacher", "deputy"]) {
    const filename = role === "teacher" ? "EduManager.html" : "Deputy.html";
    await cdp("Page.navigate", {
      url: require("node:url").pathToFileURL(
        path.join(__dirname, "..", filename),
      ).href,
    });
    const id = role === "teacher" ? "mobileStatus" : "deputyOfflineStatus";
    for (let i = 0; i < 100; i++) {
      try {
        if (
          await evaluate(
            "location.protocol==='file:'&&!!document.getElementById(" +
              JSON.stringify(id) +
              ")?.textContent.includes('فایل مستقل')",
          )
        )
          break;
      } catch {}
      await delay(50);
    }
    localMessages.push(
      await evaluate(
        "document.getElementById(" + JSON.stringify(id) + ").textContent",
      ),
    );
  }
  cases.push({
    id: "HELP_LOCAL_FILE_MESSAGE",
    pass:
      localMessages[0] === localMessages[1] &&
      localMessages[0].includes("نصب استاندارد PWA"),
    observed: localMessages,
  });
}
module.exports = run;
if (require.main === module)
  require("./data-integrity.cjs")
    .main({ stage: "install-help-parity", runExtra: run })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
