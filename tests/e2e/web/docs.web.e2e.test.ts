import { test, expect } from '@playwright/test';

test('index loads and navigates to API docs', async ({ page }) => {
  await page.goto('/web/index.html');
  await expect(page).toHaveTitle(/KnowWhere - Semantic Academic Search/);

  await page.getByRole('link', { name: 'API' }).click();
  await expect(page).toHaveURL(/\/web\/api\.html/);
  await expect(page).toHaveTitle(/KnowWhere API Documentation/);
});

test('playground loads and shows search controls', async ({ page }) => {
  await page.goto('/web/test.html');
  await expect(page).toHaveTitle(/KnowWhere Search Playground/);

  await expect(page.locator('#query')).toBeVisible();
  await expect(page.locator('#search-btn')).toBeVisible();
  await expect(page.locator('#results-list-lex')).toBeVisible();
  await expect(page.locator('#results-list-hybrid')).toBeVisible();
});

test('playground can search and render a seeded paper', async ({ page }) => {
  await page.goto('/web/test.html');
  await expect(page.locator('#query')).toBeVisible();

  await page.locator('#query').fill('graph neural networks');
  const searchResponse = page.waitForResponse(
    (res) => res.url().endsWith('/search') && res.request().method() === 'POST'
  );
  await page.locator('#search-btn').click();
  const res = await searchResponse;
  if (!res.ok()) {
    const body = await res.text().catch(() => '<failed to read body>');
    throw new Error(`Expected /search 200, got ${res.status()}. Body: ${body}`);
  }

  // No error toast (user-friendly failures use #kw-toast-host .kw-toast--error).
  await expect(page.locator('#kw-toast-host .kw-toast--error')).toHaveCount(0, { timeout: 60_000 });

  // Wait for at least one rendered result card (seeded example appears in either column).
  const firstCard = page.locator('.result-card').filter({ hasText: 'Graph Neural Networks for Molecules' }).first();
  await expect(firstCard).toBeVisible({ timeout: 60_000 });
});

