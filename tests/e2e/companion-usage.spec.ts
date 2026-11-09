import { test, expect } from '@playwright/test';

test('usage separates captured tokens from account allowances and stays outside the fixed floor', async ({
  page,
}) => {
  const now = new Date().toISOString();
  const totals = {
    inputTokens: 1200,
    cachedInputTokens: 700,
    outputTokens: 300,
    totalTokens: 1500,
    responses: 2,
  };
  let usage: any = {
    hour: totals,
    week: { ...totals, totalTokens: 9000 },
    month: { ...totals, totalTokens: 15000 },
    updatedAt: now,
    observedSince: now,
    sessionCount: 1,
    coverage: 'observed-only',
    plan: {
      observedAt: now,
      planType: 'plus',
      windows: [
        {
          name: 'primary',
          usedPercent: 25,
          windowMinutes: 300,
          resetsAt: new Date(Date.now() + 3600000).toISOString(),
        },
        {
          name: 'secondary',
          usedPercent: 70,
          windowMinutes: 10080,
          resetsAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
    },
  };
  await page.route('**/api/companion/snapshot', (route) =>
    route.fulfill({
      json: {
        sessions: [],
        messages: [],
        companyActive: false,
        conflicts: [],
        usage,
        integration: {
          installed: true,
          hooksEnabled: true,
          cli: 'verified',
          ide: 'unverified',
          notes: [],
        },
      },
    }),
  );
  await page.goto('/visualizer');
  await page.setViewportSize({ width: 1440, height: 768 });
  await page.getByLabel('Session source').selectOption('ide');
  const strip = page.getByRole('region', { name: 'Last reported plan allowance' });
  await expect(strip).toBeVisible();
  await expect(strip.getByRole('article', { name: '5-hour allowance', exact: true })).toContainText(
    '75% remaining',
  );
  await expect(strip.getByRole('progressbar', { name: '5-hour remaining' })).toHaveAttribute(
    'value',
    '75',
  );
  await expect(strip.getByRole('article', { name: 'Weekly allowance', exact: true })).toContainText(
    'Expired snapshot',
  );
  await page.getByRole('button', { name: 'View usage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Usage', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('across workspace and source filters');
  await expect(dialog.getByRole('article', { name: 'Past hour', exact: true })).toContainText(
    '1,500',
  );
  await expect(dialog.getByRole('article', { name: 'Past week', exact: true })).toContainText(
    '9,000',
  );
  await expect(dialog.getByRole('article', { name: 'Past month', exact: true })).toContainText(
    '15,000',
  );
  await expect(
    dialog.getByRole('article', { name: '5-hour allowance', exact: true }),
  ).toContainText('75% remaining when reported');
  await expect(
    dialog.getByRole('article', { name: 'Weekly allowance', exact: true }),
  ).toContainText('Expired snapshot');
  await expect(dialog).toContainText('not a live quota check');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  for (const card of await page.locator('.hq-member').all())
    await expect(card).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'View usage' }).click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  usage = undefined;
  await page.getByRole('button', { name: 'Refresh observed sessions' }).click();
  await expect(strip.getByRole('article', { name: '5-hour allowance', exact: true })).toContainText(
    'Unavailable',
  );
  await expect(strip.getByRole('article', { name: 'Weekly allowance', exact: true })).toContainText(
    'Unavailable',
  );
  await expect(strip.getByRole('progressbar')).toHaveCount(0);
  await page.getByRole('button', { name: 'View usage' }).click();
  await expect(dialog.getByRole('article', { name: 'Past hour', exact: true })).toContainText(
    'No captured usage',
  );
  await expect(dialog).toContainText('Plan allowance unavailable');
  await expect(dialog.getByText('0% remaining when reported')).toHaveCount(0);
});
