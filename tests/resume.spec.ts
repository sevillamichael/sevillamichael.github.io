import { expect, test } from "@playwright/test";
import path from "path";
import { pathToFileURL } from "url";

const homeUrl = pathToFileURL(path.resolve(__dirname, "..", "index.html")).href;

test.describe("Resume site", () => {
  test("renders the main hero content", async ({ page }) => {
    await page.goto(homeUrl);

    await expect(page).toHaveTitle("Michael Sevilla");
    await expect(page.getByRole("heading", { level: 1, name: "Michael Sevilla" })).toBeVisible();
    await expect(page.locator(".hero .subtitle").first()).toHaveText("Senior QA Engineer");
    await expect(page.getByRole("link", { name: "GitHub profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: "LinkedIn profile" })).toBeVisible();
  });

  test("shows core resume sections", async ({ page }) => {
    await page.goto(homeUrl);

    await expect(page.getByRole("heading", { level: 2, name: "About" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Experience" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Education" })).toBeVisible();
  });

  test("contains expected experience entries", async ({ page }) => {
    await page.goto(homeUrl);

    await expect(page.locator("#pultemortgage")).toContainText("Gorilla Logic");
    await expect(page.locator("#fullstack")).toContainText("FullStack");
    await expect(page.locator("#fullstack")).toContainText("Senior QA Engineer at SIDEARM Sports");
    await expect(page.locator("#fullstack")).toContainText("Senior QA Engineer at HopSkipDrive");
    await expect(page.locator("#accesso")).toContainText("Encora Inc.");
    await expect(page.locator("#healthrecoverysolutions")).toContainText("EX Squared LATAM");
    await expect(page.locator("#bmw-usa")).toContainText("Critical Mass");
    await expect(page.locator("#ciberrisk")).toContainText("Ciber Risk S.A.");
  });

  test("links to external professional profiles", async ({ page }) => {
    await page.goto(homeUrl);

    await expect(page.getByRole("link", { name: "GitHub profile" })).toHaveAttribute("href", "https://github.com/sevillamichael");
    await expect(page.getByRole("link", { name: "LinkedIn profile" })).toHaveAttribute("href", "https://www.linkedin.com/in/sevillamichael");
  });

  test("keeps company rows readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(homeUrl);

    const firstJob = page.locator("#pultemortgage");
    await expect(firstJob.getByText("Senior QA Engineer at Pulte Mortgage")).toBeVisible();
    await expect(firstJob.getByText("Jun 2022 - Present")).toBeVisible();
  });
});
