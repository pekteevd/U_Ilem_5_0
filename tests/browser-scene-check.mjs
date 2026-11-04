import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("artifacts");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage"
  ]
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const failedRequests = [];
const mapResponses = [];

page.on("pageerror", error => errors.push("pageerror: " + error.message));
page.on("console", message => {
  if (message.type() === "error") errors.push("console: " + message.text());
});
page.on("requestfailed", request => failedRequests.push({
  url: request.url(),
  error: request.failure()?.errorText || "unknown"
}));
page.on("response", response => {
  if (response.url().includes("U_Ilem_map_empty.png")) {
    mapResponses.push({ status: response.status(), url: response.url() });
  }
});

try {
  const response = await page.goto("http://127.0.0.1:4175", { waitUntil: "domcontentloaded", timeout: 30000 });
  if (!response || !response.ok()) throw new Error("Главная страница не загрузилась: " + (response?.status() ?? "no response"));

  await page.waitForFunction(
    () => document.querySelector("#map-loading")?.classList.contains("hidden"),
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(1500);

  const scene = await page.evaluate(() => {
    const canvas = document.querySelector("#world-canvas");
    const viewport = document.querySelector("#world-viewport");
    const loading = document.querySelector("#map-loading");
    const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
    return {
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      clientWidth: canvas?.clientWidth || 0,
      clientHeight: canvas?.clientHeight || 0,
      viewportAspectRatio: viewport?.style.aspectRatio || "",
      mapLoadingHidden: loading?.classList.contains("hidden") || false,
      webglAvailable: !!gl,
      webglVersion: gl ? gl.getParameter(gl.VERSION) : null,
      webglRenderer: gl ? gl.getParameter(gl.RENDERER) : null,
      webglError: gl ? gl.getError() : null,
      tabs: [...document.querySelectorAll("[data-tab]")].map(x => x.dataset.tab)
    };
  });

  if (!scene.webglAvailable) throw new Error("WebGL-контекст не создан");
  if (!scene.canvasWidth || !scene.canvasHeight) throw new Error("Canvas имеет нулевой размер");
  if (!scene.mapLoadingHidden) throw new Error("Индикатор загрузки карты не скрылся");
  if (!mapResponses.some(x => x.status === 200)) throw new Error("Пустая карта не загружена с HTTP 200");
  if (scene.webglError !== 0) throw new Error("WebGL вернул ошибку: " + scene.webglError);

  await page.screenshot({ path: path.join(out, "scene.png"), fullPage: true });

  // Exercise camera controls and tab navigation, then return to the overview.
  await page.click("#zoom-in");
  await page.click("#zoom-out");
  await page.click("#reset-view");
  await page.click('[data-tab="construction"]');
  const constructionTabVisible = await page.locator("#tab-title").textContent();
  await page.click('[data-tab="overview"]');

  const report = {
    result: errors.length === 0 && failedRequests.length === 0 ? "PASS" : "FAIL",
    pageStatus: response.status(),
    scene,
    mapResponses,
    constructionTabVisible,
    consoleAndPageErrors: errors,
    failedRequests
  };

  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (errors.length || failedRequests.length) process.exitCode = 1;
} catch (error) {
  fs.writeFileSync(path.join(out, "failure.txt"), String(error?.stack || error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
