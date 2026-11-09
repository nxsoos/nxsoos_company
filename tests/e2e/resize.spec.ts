import { test, expect } from '@playwright/test';
test('CEO chat resizes by dragging and keyboard, remembers width, and stacks on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/company');
  const separator = page.getByRole('separator', { name: 'Resize CEO chat' });
  await expect(separator).toBeVisible();
  const chat = page.getByRole('complementary', { name: 'CEO conversation' });
  const before = (await chat.boundingBox())!.width;
  const handle = (await separator.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x - 170, handle.y + 200, { steps: 8 });
  await page.mouse.up();
  const expanded = (await chat.boundingBox())!.width;
  expect(expanded).toBeGreaterThan(before + 150);
  await separator.focus();
  await page.keyboard.press('ArrowLeft');
  const keyboard = (await chat.boundingBox())!.width;
  expect(keyboard).toBeGreaterThan(expanded + 25);
  await page.reload();
  await expect(separator).toBeVisible();
  expect(Math.abs((await chat.boundingBox())!.width - keyboard)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/resizable-chat.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(separator).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
