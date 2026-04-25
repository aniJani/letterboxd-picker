import { test, expect } from "@playwright/test";

test("idle page renders core elements", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("PICK ME")).toBeVisible();
  await expect(page.getByText(/A FILM/)).toBeVisible();
  await expect(page.getByText("GENRE")).toBeVisible();
  await expect(page.getByText("DECADE")).toBeVisible();
  await expect(page.getByText("MIN RATING")).toBeVisible();
});

test("invalid username shows inline error", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("textbox");
  await input.fill("a");
  await input.blur();
  await expect(page.getByText(/INVALID HANDLE/)).toBeVisible();
});
