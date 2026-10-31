import { expect, test } from '@playwright/test';

test('opens on the Browse tab', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.locator('ion-title').first()).toContainText('Lost & Found');
});
