import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const route of ["/", "/framework/getting-started/", "/integrations/"]) {
  test(`${route} has no automatically detectable accessibility violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("compare control is keyboard operable", async ({ page }) => {
  await page.goto("/");
  const range = page.getByRole("slider", { name: "Spice reveal" });
  await range.focus();
  await range.press("End");
  await expect(range).toHaveValue("100");
  await range.press("Home");
  await expect(range).toHaveValue("0");
});
