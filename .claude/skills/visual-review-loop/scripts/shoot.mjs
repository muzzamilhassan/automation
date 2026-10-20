#!/usr/bin/env node
// Full-page screenshots of a running app at 3 widths — the visual-review-loop capture step.
// Usage:   node shoot.mjs <url> [outDir] [--rtl]
// Example: node shoot.mjs http://localhost:3000/dashboard shots/dashboard --rtl
// Requires playwright in the project:  npm i -D playwright && npx playwright install chromium

import { mkdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2).filter((a) => a !== "--rtl");
const rtl = process.argv.includes("--rtl");
const url = args[0];
const outDir = args[1] ?? "shots";
if (!url) {
  console.error("usage: node shoot.mjs <url> [outDir] [--rtl]");
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright is not installed in this project (one time setup):\n" +
      "  npm i -D playwright && npx playwright install chromium"
  );
  process.exit(1);
}

const widths = [1440, 768, 375];
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const consoleErrors = [];
const failures = [];

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`[${width}] ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`[${width}] pageerror: ${e.message}`));
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (rtl) {
      await page.evaluate(() =>
        document.documentElement.setAttribute("dir", "rtl")
      );
      await page.waitForTimeout(150); // let mirrored layout settle
    }
    const suffix = rtl ? "-rtl" : "";
    const file = path.join(outDir, `${width}${suffix}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log("saved", file);
  } catch (e) {
    failures.push(`[${width}] ${e.message}`);
  }
  await page.close();
}

await browser.close();

if (consoleErrors.length) {
  console.log("\nconsole errors captured:");
  for (const line of [...new Set(consoleErrors)]) console.log("  " + line);
}
if (failures.length) {
  console.error("\nfailures:\n" + failures.map((f) => "  " + f).join("\n"));
  process.exit(2);
}
console.log("\ndone — now LOOK at the screenshots (read the image files) and list diffs.");
