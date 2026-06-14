#!/usr/bin/env node
/** Capture logged-out partner landing page screenshots. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "docs/partner-portal-screenshots");
const BASE = process.env.PARTNER_QA_BASE_URL || "http://localhost:3456";

async function shot(page, name, { fullPage = true, y = 0 } = {}) {
  if (y) await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(async () => {
    const imgs = Array.from(document.images).filter((img) => {
      const rect = img.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              })
      )
    );
  });
  await new Promise((r) => setTimeout(r, 250));
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage });
  console.log("saved", name);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector(".pl-hero", { timeout: 15000 });

  await shot(page, "landing-01-hero.png", { fullPage: false });
  await shot(page, "landing-02-why-partner.png", { y: 900 });
  await shot(page, "landing-03-vision-flow.png", { y: 1800 });
  await shot(page, "landing-04-categories-austin.png", { y: 3200 });
  await shot(page, "landing-05-inquiry.png", { y: 4800 });
  await shot(page, "landing-06-login.png", { y: 6200 });
  await shot(page, "landing-full-page.png", { fullPage: true });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
