"use strict";
// Generates documentation artifacts only; never opens the application or user data.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawn } = require("node:child_process"),
  { pathToFileURL } = require("node:url");

async function main() {
  const root = path.resolve(__dirname, ".."),
    directory = path.join(root, "docs", "guide"),
    source = fs.readFileSync(
      path.join(directory, "brochure.source.html"),
      "utf8",
    ),
    fonts = fs.readFileSync(
      path.join(root, "src", "styles", "fonts.css"),
      "utf8",
    ),
    html = source.replace(
      /<link\b[^>]*\bdata-guide-fonts\b[^>]*>/,
      "<style>" + fonts + "</style>",
    ),
    standalone = path.join(directory, "kelas-yar-guide.html"),
    pdf = path.join(directory, "kelas-yar-guide.pdf"),
    executable =
      process.env.EDUMANAGER_EDGE ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (!fs.existsSync(executable))
    throw Error("Set EDUMANAGER_EDGE to a Chromium browser executable.");
  if (html === source || /<link\b/.test(html))
    throw Error("The standalone guide must embed its fonts and styles.");
  fs.writeFileSync(standalone, html);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "edu-guide-export-")),
    browser = spawn(
      executable,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-first-run",
        "--no-proxy-server",
        "--disable-background-networking",
        "--disable-extensions",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--remote-debugging-port=0",
        "--user-data-dir=" + profile,
        "about:blank",
      ],
      { windowsHide: true, stdio: "ignore" },
    ),
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    pending = new Map();
  let ws, cdp, launchError;
  browser.once("error", (error) => {
    launchError = error;
  });
  try {
    const endpoint = path.join(profile, "DevToolsActivePort");
    for (let n = 0; n < 150 && !fs.existsSync(endpoint); n++) {
      if (launchError) throw launchError;
      await pause(100);
    }
    if (!fs.existsSync(endpoint)) throw Error("Browser did not start.");
    const port = fs.readFileSync(endpoint, "utf8").split("\n")[0],
      pages = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
    ws = new WebSocket(
      pages.find((page) => page.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    let sequence = 0;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data),
        request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    };
    cdp = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence,
          timer = setTimeout(() => {
            pending.delete(id);
            reject(Error("Browser timeout: " + method));
          }, 25000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const value = await cdp("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (value.exceptionDetails)
        throw Error(JSON.stringify(value.exceptionDetails));
      return value.result.value;
    };
    await cdp("Page.enable");
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 1100,
      height: 1300,
      deviceScaleFactor: 1.6,
      mobile: false,
    });
    await cdp("Page.navigate", { url: pathToFileURL(standalone).href });
    for (let n = 0; n < 100; n++) {
      if (
        await evaluate(
          "document.readyState === 'complete' && document.querySelectorAll('.page').length === 4",
        )
      )
        break;
      await pause(100);
    }
    await evaluate("document.fonts.ready.then(() => true)");
    const desktop =
      await evaluate(`Array.from(document.querySelectorAll('.page'), (page) => {
      const box = page.getBoundingClientRect(), footer = page.querySelector('.page-footer').getBoundingClientRect();
      return {x:box.x+scrollX,y:box.y+scrollY,width:box.width,height:box.height,scrollHeight:page.scrollHeight,clientHeight:page.clientHeight,footerBottom:footer.bottom-box.top};
    })`);
    if (
      desktop.length !== 4 ||
      desktop.some(
        (page) =>
          page.scrollHeight > page.clientHeight + 1 ||
          page.footerBottom > page.height - 15,
      )
    )
      throw Error("Guide page overflows: " + JSON.stringify(desktop));
    const images = [];
    for (const [index, clip] of desktop.entries()) {
      const shot = await cdp("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: {
            x: clip.x,
            y: clip.y,
            width: clip.width,
            height: clip.height,
            scale: 1,
          },
        }),
        file = path.join(
          directory,
          "kelas-yar-guide-page-" + (index + 1) + ".png",
        );
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      images.push(file);
    }
    await cdp("Emulation.setEmulatedMedia", { media: "print" });
    const printed = await evaluate(
      "Array.from(document.querySelectorAll('.page'), p => ({height:p.getBoundingClientRect().height,scroll:p.scrollHeight,client:p.clientHeight}))",
    );
    if (printed.some((page) => page.scroll > page.client + 1))
      throw Error("Print layout overflows: " + JSON.stringify(printed));
    const result = await cdp("Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
      }),
      bytes = Buffer.from(result.data, "base64"),
      count = (bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || [])
        .length;
    if (bytes.subarray(0, 5).toString() !== "%PDF-" || count !== 4)
      throw Error("Expected exactly 4 PDF pages, found " + count);
    fs.writeFileSync(pdf, bytes);
    await cdp("Emulation.setEmulatedMedia", { media: "screen" });
    const responsive = [];
    for (const width of [320, 390, 768]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const measurement = await evaluate(
        "({width:innerWidth,scroll:document.documentElement.scrollWidth})",
      );
      if (measurement.scroll > measurement.width + 1)
        throw Error("Mobile guide overflows: " + JSON.stringify(measurement));
      responsive.push(measurement);
    }
    console.log(
      JSON.stringify(
        {
          pdf,
          standalone,
          images,
          pdfPages: count,
          bytes: bytes.length,
          responsive,
          profile,
        },
        null,
        2,
      ),
    );
  } finally {
    if (cdp && ws?.readyState === WebSocket.OPEN) {
      try {
        await cdp("Browser.close");
      } catch {
        /* Browser may already be closed. */
      }
    }
    if (ws) ws.close();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error("Guide export closed."));
    }
    if (browser.exitCode === null) browser.kill();
  }
}
main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
