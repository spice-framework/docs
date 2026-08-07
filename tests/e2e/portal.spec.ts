import { expect, test } from "@playwright/test";

test("landing page exposes product paths and canonical Spice source", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Spice Framework" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute(
    "href",
    "/framework/getting-started/",
  );

  const viewer = page.locator("[data-spice-viewer]");
  await expect(
    viewer.locator("[data-spice-source-layer]").getByText("// @Application", { exact: true }),
  ).toBeAttached();
  await viewer.getByRole("button", { name: "Spice view" }).click();
  await expect(viewer).toHaveAttribute("data-spice-view", "spice");
  await expect(viewer.locator("[data-spice-source-layer]")).toContainText("// @Application");
});

test("search exposes reviewed metadata filters and product pills", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search documentation" }).click();
  await page.getByRole("searchbox", { name: "Search documentation" }).fill("PostgreSQL");
  await expect(page.getByRole("status")).toContainText(/matching page/);
  await expect(page.getByRole("link", { name: /PostgreSQL/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Integrations" }).click();
  await expect(page.getByRole("button", { name: "Integrations" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("status")).toContainText(/matching page/);
});

test("imported pages expose exact source and raw Markdown", async ({ page, request }) => {
  await page.goto("/framework/getting-started/");
  const source = page.getByRole("link", { name: /Source: spice@[0-9a-f]{7}/ });
  await expect(source).toHaveAttribute(
    "href",
    /github\.com\/spice-framework\/spice\/blob\/[0-9a-f]{40}\/docs\/getting-started\.md/,
  );
  const raw = await request.get("/raw/framework/getting-started.md");
  expect(raw.ok()).toBe(true);
  expect(await raw.text()).toContain("# Getting started");
});

test("product navigation reaches generated integration pages", async ({ page }) => {
  await page.goto("/integrations/");
  await page.getByRole("link", { name: "PostgreSQL" }).first().click();
  await expect(page).toHaveURL(/\/integrations\/postgres\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("PostgreSQL");
});
