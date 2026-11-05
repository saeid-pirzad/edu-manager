"use strict";

// Logo integration only: real DOM, decoded PNGs and byte-exact offline assets.
// Uses the existing temporary Edge profile and synthetic application fixture.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { main } = require("./data-integrity.cjs");

async function inspectLogo(selector) {
  const image = document.querySelector(selector);
  if (!image) throw Error("Logo image is missing: " + selector);
  await image.decode();
  const frame = image.parentElement;
  const imageBox = image.getBoundingClientRect();
  const frameBox = frame.getBoundingClientRect();
  const style = getComputedStyle(image);
  return {
    source: new URL(image.currentSrc || image.src).pathname,
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    imageWidth: imageBox.width,
    imageHeight: imageBox.height,
    frameWidth: frameBox.width,
    frameHeight: frameBox.height,
    frameBackground: getComputedStyle(frame).backgroundColor,
    frameFits: frameBox.left >= -1 && frameBox.right <= innerWidth + 1,
    objectFit: style.objectFit,
    filter: style.filter,
    alternative: image.hasAttribute("alt"),
    noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
  };
}

async function readLogoAssets() {
  const manifestLink = document.querySelector('link[rel="manifest"]');
  const favicon = document.querySelector('link[rel="icon"]');
  const apple = document.querySelector('link[rel="apple-touch-icon"]');
  if (!manifestLink || !favicon || !apple)
    throw Error("Logo installation metadata is incomplete");
  const manifestResponse = await fetch(manifestLink.href, { cache: "reload" });
  if (!manifestResponse.ok) throw Error("Manifest was not available");
  const manifest = await manifestResponse.json();
  return {
    manifest: new URL(manifestLink.href).pathname,
    favicon: new URL(favicon.href).pathname,
    apple: new URL(apple.href).pathname,
    icons: manifest.icons.map((icon) => ({
      ...icon,
      path: new URL(icon.src, manifestLink.href).pathname,
    })),
  };
}

async function fetchAssets(paths) {
  return Promise.all(
    paths.map(async (pathname) => {
      const response = await fetch(pathname, { cache: "reload" });
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const image = new Image();
      image.src = pathname;
      await image.decode();
      return {
        path: pathname,
        status: response.status,
        mime: response.headers.get("content-type")?.split(";")[0],
        bytes: bytes.byteLength,
        sha256: Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join(""),
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }),
  );
}

async function networkProbe() {
  const url = new URL("__logo_offline_probe__", location.href);
  url.searchParams.set("nonce", crypto.randomUUID());
  const result = {
    online: navigator.onLine,
    timeOrigin: performance.timeOrigin,
    controlled: !!navigator.serviceWorker.controller,
    blocked: false,
  };
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    result.status = response.status;
  } catch (error) {
    result.error = error.name;
    result.blocked = error.name === "TypeError";
  }
  return result;
}

async function run({ cdp, evaluate, cases, delay, root }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "edu-logo-browser-"));
  const source = fs.readFileSync(path.join(root, "assets/logo3.png"));
  const natural = {
    width: source.readUInt32BE(16),
    height: source.readUInt32BE(20),
  };
  const add = (id, name, pass, observed) =>
    cases.push({ id: "LOGO_" + id, name, pass: !!pass, observed });
  const evaluateCall = (method, argument) =>
    evaluate(
      "(" +
        method.toString() +
        ")(" +
        (argument === undefined ? "" : JSON.stringify(argument)) +
        ")",
    );
  const capture = async (name) => {
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(directory, name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  };
  const inspect = async (selector, name, width) => {
    const result = await evaluateCall(inspectLogo, selector);
    add(
      name + "_" + width,
      "The real " + name + " logo decodes and fits at " + width + "px",
      result.complete &&
        result.naturalWidth === natural.width &&
        result.naturalHeight === natural.height &&
        result.source === "/edu-manager/assets/logo3.png" &&
        result.frameWidth >= 24 &&
        result.frameWidth <= 120 &&
        Math.abs(result.imageWidth - result.imageHeight) <= 1 &&
        result.frameFits &&
        result.objectFit === "contain" &&
        result.filter === "none" &&
        result.alternative &&
        (!["HEADER", "OFFLINE_HEADER"].includes(name) ||
          result.frameBackground === "rgba(0, 0, 0, 0)") &&
        result.noPageOverflow,
      result,
    );
    await capture(name.toLowerCase() + "-" + width);
  };
  const viewport = async (width) =>
    cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
  const waitFor = async (expression, message) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    const diagnostic = await evaluate(`(async()=>({
      expression:${JSON.stringify(expression)}, url:location.href,
      status:globalThis.EduPWA?.getStatus?.(), mobile:document.getElementById('mobileStatus')?.textContent,
      controller:navigator.serviceWorker.controller?.scriptURL || null,
      registrations:(await navigator.serviceWorker.getRegistrations()).map(registration=>({scope:registration.scope,active:registration.active?.state,waiting:registration.waiting?.state,installing:registration.installing?.state})),
      cacheKeys:await caches.keys(), errors:globalThis.__eduStartupErrors || []
    }))()`);
    fs.writeFileSync(
      path.join(directory, "readiness-failure.json"),
      JSON.stringify(diagnostic, null, 2) + "\n",
    );
    throw Error(message);
  };
  const overrideState = (offline) =>
    cdp("Network.overrideNetworkState", {
      offline,
      latency: 0,
      downloadThroughput: offline ? 0 : -1,
      uploadThroughput: offline ? 0 : -1,
    });
  const reloadReady = require("./browser-ready.cjs");

  // Exercise the real first-visit dialog rather than copying its markup into a
  // synthetic element. Only this harness's isolated localStorage is affected.
  await evaluate("localStorage.removeItem('edu-manager:pwa-notice:v1')");
  await reloadReady({ cdp, evaluate, delay });
  await waitFor(
    "!!document.querySelector('#pwaWelcome[open] .pwa-install-brand img')",
    "The actual installer logo did not appear",
  );
  for (const width of [390, 1280]) {
    await viewport(width);
    await inspect("#pwaWelcome .pwa-install-brand img", "INSTALL", width);
  }
  await evaluate(
    "document.getElementById('pwaWelcomeLater').click();closeModal();goSchools()",
  );
  for (const width of [320, 390, 768, 1280]) {
    await viewport(width);
    await evaluate("closeModal();goSchools();window.scrollTo(0,0)");
    await delay(100);
    await inspect(".topbar .brand-mark img", "HEADER", width);
    if ([390, 1280].includes(width)) {
      await evaluate(
        "document.querySelector('[data-about-action=\"open\"]').click()",
      );
      await inspect("#modalBody .about-mark img", "ABOUT", width);
      await evaluate("closeModal();renderLogin()");
      await inspect(".login-brand img", "LOGIN", width);
      await evaluate("goSchools()");
    }
  }
  const references = await evaluateCall(readLogoAssets);
  const expected = new Map([
    ["/edu-manager/assets/logo3.png", natural],
    ["/edu-manager/assets/icons/logo-512.png", { width: 512, height: 512 }],
    ["/edu-manager/assets/icons/logo-192.png", { width: 192, height: 192 }],
    ["/edu-manager/assets/icons/logo-180.png", { width: 180, height: 180 }],
    ["/edu-manager/assets/icons/logo-32.png", { width: 32, height: 32 }],
  ]);
  add(
    "METADATA",
    "Favicon, Apple and install manifest use the actual local logo derivatives",
    references.manifest === "/edu-manager/app.webmanifest" &&
      references.favicon === "/edu-manager/assets/icons/logo-32.png" &&
      references.apple === "/edu-manager/assets/icons/logo-180.png" &&
      references.icons.length === 2 &&
      references.icons.every(
        (icon) =>
          expected.has(icon.path) &&
          icon.type === "image/png" &&
          icon.sizes ===
            `${expected.get(icon.path).width}x${expected.get(icon.path).height}`,
      ) &&
      new Set(references.icons.map((icon) => icon.path)).size === 2,
    references,
  );
  const fingerprint = new Map(
    [...expected].map(([pathname, dimensions]) => {
      const bytes = fs.readFileSync(
        path.join(root, pathname.replace(/^\/edu-manager\//, "")),
      );
      return [
        pathname,
        {
          ...dimensions,
          bytes: bytes.length,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        },
      ];
    }),
  );
  const verifyAssets = async (name) => {
    const assets = await evaluateCall(fetchAssets, [...expected.keys()]);
    for (const asset of assets) {
      const original = fingerprint.get(asset.path);
      add(
        name + "_" + path.posix.basename(asset.path),
        name + " PNG bytes, MIME and decoded size match disk: " + asset.path,
        asset.status === 200 &&
          asset.mime === "image/png" &&
          asset.bytes === original.bytes &&
          asset.sha256 === original.sha256 &&
          asset.width === original.width &&
          asset.height === original.height,
        asset,
      );
    }
  };
  await verifyAssets("ONLINE");
  await evaluate("navigator.serviceWorker.ready");
  await waitFor(
    "EduPWA.getStatus().offlineReady",
    "The logo worker did not finish its verified offline cache",
  );
  // A normal installed-app navigation must be controlled by the activated
  // worker. A DevTools hard reload deliberately bypasses that control online.
  await reloadReady({ cdp, evaluate, delay }, { ignoreCache: false });
  await waitFor(
    "!!(EduPWA.getStatus().offlineReady && navigator.serviceWorker.controller)",
    "The logo release did not become offline ready",
  );
  await cdp("Network.enable");
  await cdp("Network.setCacheDisabled", { cacheDisabled: true });
  const control = await evaluateCall(networkProbe);
  add(
    "NETWORK_CONTROL",
    "The uncached online control reaches the live loopback server",
    control.online && control.status === 404 && !control.blocked,
    control,
  );
  try {
    await cdp("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await overrideState(true);
    await waitFor(
      "navigator.onLine === false",
      "The native browser did not enter offline mode",
    );
    const before = await evaluateCall(networkProbe);
    await reloadReady({ cdp, evaluate, delay }, { ignoreCache: false });
    const fresh = await evaluateCall(networkProbe);
    await overrideState(true);
    await waitFor(
      "navigator.onLine === false",
      "The fresh renderer did not expose the native offline state",
    );
    const after = await evaluateCall(networkProbe);
    add(
      "OFFLINE_RELOAD",
      "A genuinely fresh offline page retains the logo with no network or HTTP-cache fallback",
      before.blocked &&
        !before.online &&
        fresh.blocked &&
        after.blocked &&
        !after.online &&
        after.controlled &&
        before.timeOrigin !== after.timeOrigin,
      { before, fresh, after },
    );
    await verifyAssets("OFFLINE");
    await viewport(390);
    await evaluate("goSchools();window.scrollTo(0,0)");
    await delay(100);
    await inspect(".topbar .brand-mark img", "OFFLINE_HEADER", 390);
  } finally {
    await cdp("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await overrideState(false);
    await cdp("Network.setCacheDisabled", { cacheDisabled: false });
  }
  fs.writeFileSync(
    path.join(directory, "logo-observations.json"),
    JSON.stringify(
      { source: natural, references, assets: Object.fromEntries(fingerprint) },
      null,
      2,
    ) + "\n",
  );
  add(
    "ARTIFACTS",
    "Mobile, tablet, desktop, install, login, about and offline logo previews were recorded",
    fs.readdirSync(directory).filter((name) => name.endsWith(".png")).length ===
      11,
    { directory },
  );
  console.log("Logo audit artifacts: " + directory);
}

module.exports = { run };
if (require.main === module)
  main({ stage: "logo-ui-pwa", runExtra: run }).catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 2;
  });
