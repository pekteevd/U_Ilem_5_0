import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { WORLD_OBJECTS, WORLD_MAP_CONFIG } from "../world-data.js";

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
const httpErrors = [];

page.on("pageerror", error => errors.push("pageerror: " + error.message));
page.on("console", message => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource: the server responded with a status of 404")) errors.push("console: " + message.text());
});
page.on("requestfailed", request => failedRequests.push({
  url: request.url(),
  error: request.failure()?.errorText || "unknown"
}));
await page.route("**/favicon.ico", route => route.fulfill({ status: 204, body: "" }));

page.on("response", async response => {
  if (response.url().includes("U_Ilem_map_empty.png")) {
    mapResponses.push({ status: response.status(), url: response.url() });
  }
  if (response.status() >= 400) {
    const body = await response.text().catch(() => "");
    const expectedFirstRun = response.url().endsWith("/api/save") &&
      response.status() === 404 && body.includes("save_not_found");
    if (!expectedFirstRun) httpErrors.push({
      status: response.status(),
      url: response.url(),
      body: body.slice(0, 300)
    });
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
  const baseMapDataUrl = await page.evaluate(async file => {
    const image = new Image();
    image.src = "./" + file;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  }, WORLD_MAP_CONFIG.file);
  fs.writeFileSync(path.join(out, "base-map.png"), Buffer.from(baseMapDataUrl.split(",")[1], "base64"));

  // Exercise camera controls and tab navigation, then return to the overview.
  await page.click("#zoom-in");
  await page.click("#zoom-out");
  await page.click("#reset-view");

  const objectSelections = [];
  const viewportRect = await page.locator("#world-viewport").boundingBox();
  const imageSize = await page.evaluate(async file => {
    const image = new Image();
    image.src = "./" + file;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, WORLD_MAP_CONFIG.file);
  const mapWidth = WORLD_MAP_CONFIG.worldWidth;
  const cameraHeight = 100, cameraDepth = 70;
  const cameraLength = Math.hypot(cameraHeight, cameraDepth);
  const cameraUpY = cameraDepth / cameraLength;
  const cameraUpZ = -cameraHeight / cameraLength;
  const projectedMapHeight = mapWidth / (imageSize.width / imageSize.height);
  const mapHeight = projectedMapHeight / Math.abs(cameraUpZ);
  const cameraAspect = viewportRect.width / viewportRect.height;
  const viewHeight = Math.max(mapHeight * Math.abs(cameraUpZ) * 1.12, mapWidth / cameraAspect * 1.12);
  const viewWidth = viewHeight * cameraAspect;

  for (const object of WORLD_OBJECTS) {
    const worldX = (object.position.x - 0.5) * mapWidth;
    const worldZ = (object.position.y - 0.5) * mapHeight;
    const projectedUp = cameraUpY * 0.04 + cameraUpZ * worldZ;
    const screenX = viewportRect.x + (0.5 + worldX / viewWidth) * viewportRect.width;
    const screenY = viewportRect.y + (0.5 - projectedUp / viewHeight) * viewportRect.height;
    await page.mouse.click(screenX, screenY);
    await page.waitForFunction(
      name => document.querySelector("#selected-object")?.textContent?.includes(name),
      object.name,
      { timeout: 3000 }
    );
    objectSelections.push(object.name);
  }

  await page.click('[data-tab="construction"]');
  const constructionTabVisible = await page.locator("#tab-title").textContent();
  await page.click('[data-tab="overview"]');

  const report = {
    result: errors.length === 0 && failedRequests.length === 0 && httpErrors.length === 0 && objectSelections.length === WORLD_OBJECTS.length ? "PASS" : "FAIL",
    pageStatus: response.status(),
    scene,
    mapResponses,
    constructionTabVisible,
    objectSelections,
    httpErrors,
    consoleAndPageErrors: errors,
    failedRequests
  };

  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (errors.length || failedRequests.length || httpErrors.length || objectSelections.length !== WORLD_OBJECTS.length) process.exitCode = 1;
} catch (error) {
  fs.writeFileSync(path.join(out, "failure.txt"), String(error?.stack || error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
