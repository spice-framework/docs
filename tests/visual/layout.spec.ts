import { expect, test } from "@playwright/test";

test("desktop landing structure retains its bounded layout", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const header = await page.locator("header.header").boundingBox();
  const viewer = await page.locator("[data-spice-viewer]").boundingBox();
  expect(header?.height).toBeGreaterThanOrEqual(50);
  expect(header?.height).toBeLessThanOrEqual(90);
  expect(viewer?.width).toBeGreaterThan(600);
  expect(viewer?.width).toBeLessThanOrEqual(1200);
  await page.screenshot({ path: testInfo.outputPath("landing-desktop.png"), fullPage: true });
});

test("320px layout has no horizontal page overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  await page.screenshot({ path: testInfo.outputPath("landing-mobile.png"), fullPage: true });
});
