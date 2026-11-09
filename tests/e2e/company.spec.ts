import { test, expect } from '@playwright/test';
test('office, profile, project picker, and responsive task views', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your company, at a glance.' })).toBeVisible();
  await expect(page.getByText('Service online', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Codex visualizer', exact: true })).toHaveAttribute(
    'href',
    '/visualizer',
  );
  await expect(
    page.getByText('This office shows work assigned in the browser chat.', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 22, 19)');
  await expect(page.locator('.employee-dot[data-state="idle"]')).toHaveCount(5);
  await expect(page.getByRole('img', { name: 'Atlas: Idle', exact: true })).toHaveCSS(
    'background-color',
    'rgb(248, 113, 113)',
  );
  await expect(page.getByRole('button', { name: /Atlas.*CEO/ })).toBeVisible();
  await page.getByRole('button', { name: /Make this company yours/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('What should Atlas call you?').fill('Nasser');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('How should Atlas explain things?')).toBeVisible();
  await page.getByRole('button', { name: 'Save my preferences' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toBeVisible();
  await page.route('**/api/folders/pick', (route) =>
    route.fulfill({ json: { path: 'C:\\Projects\\sample-project' } }),
  );
  await page.getByRole('button', { name: 'Choose project folder', exact: true }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('sample-project');
  await expect(page.getByRole('button', { name: 'Change folder', exact: true })).toBeVisible();
  await page.route('**/api/folders/pick', (route) => route.fulfill({ json: { path: null } }));
  await page.getByRole('button', { name: 'Change folder', exact: true }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('sample-project');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /Task board/ }).click();
  await expect(page.getByRole('heading', { name: 'Good work, in progress.' })).toBeVisible();
  await page.getByRole('button', { name: 'Company memory', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your CEO’s guide' })).toBeVisible();
  await page.getByRole('button', { name: 'The office', exact: false }).first().click();
  await page.waitForTimeout(1500);
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/office-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/office-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('populated task evidence, approvals, and stream reconnection', async ({ page }) => {
  // UI fixture only: real delegation is tested separately by test:live.
  let sessions = 0;
  let streamAttempts = 0;
  await page.route('**/api/session', async (route) => {
    sessions++;
    await route.continue();
  });
  await page.route('**/api/events', async (route) => {
    streamAttempts++;
    if (streamAttempts === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.route('**/api/snapshot', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const createdAt = new Date().toISOString();
    data.projects = [
      {
        id: 'fixture-project',
        name: 'Personal project',
        path: 'C:\\fixture',
        description: 'UI fixture',
        color: '#91b69b',
        summary: 'Favorites are stored locally.',
        createdAt,
      },
    ];
    const base = {
      requestId: 'fixture-request',
      projectId: 'fixture-project',
      brief: 'Persist favorites.',
      acceptance: 'Favorites survive reopening.',
      dependencies: [],
      priority: 0,
      error: '',
      threadId: null,
      turnId: null,
      tokens: 1234,
      attempts: 0,
      createdAt,
      updatedAt: createdAt,
    };
    data.tasks = [
      {
        ...base,
        id: 'fixture-researcher',
        role: 'researcher',
        title: 'Investigate storage',
        status: 'working',
        result: '',
      },
      {
        ...base,
        id: 'fixture-developer',
        role: 'developer',
        title: 'Remember favorites',
        status: 'completed',
        result: 'Favorites now persist.',
      },
      {
        ...base,
        id: 'fixture-reviewer',
        role: 'reviewer',
        title: 'Review favorites',
        status: 'awaiting_input',
        result: '',
      },
    ];
    data.ceoBusy = ['fixture-project'];
    data.evidence = [
      {
        id: 'fixture-change',
        taskId: 'fixture-developer',
        kind: 'file',
        title: 'lib/favorites.dart',
        content: 'Guarded write',
        before: '// temporary favorites',
        after: 'saveFavorites();',
        createdAt,
      },
    ];
    data.approvals = [
      {
        id: 'fixture-approval',
        taskId: 'fixture-reviewer',
        kind: 'command',
        title: 'Run a project check?',
        details: 'git status --short',
        status: 'pending',
        createdAt,
      },
    ];
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await expect(page.getByText('Service online', { exact: true })).toBeVisible({ timeout: 10000 });
  expect(sessions).toBeGreaterThan(1);
  await page.getByRole('button', { name: /Personal project/ }).click();
  await page.getByRole('button', { name: /Task board/ }).click();
  await page.getByRole('button', { name: /Remember favorites/ }).click();
  await page.getByRole('button', { name: 'changes', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'lib/favorites.dart' }).click();
  await expect(page.getByText('saveFavorites();', { exact: true })).toBeVisible();
  await expect(page.getByText('// temporary favorites', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /Needs you/ }).click();
  await expect(page.getByRole('heading', { name: 'Run a project check?' })).toBeVisible();
  await expect(page.getByText('git status --short', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: /The office/ })
    .first()
    .click();
  await expect(page.getByRole('img', { name: 'Atlas: Working', exact: true })).toHaveCSS(
    'background-color',
    'rgb(74, 222, 128)',
  );
  await expect(page.getByRole('img', { name: 'Scout: Working', exact: true })).toHaveCSS(
    'background-color',
    'rgb(74, 222, 128)',
  );
  await expect(page.getByRole('img', { name: 'Nova: Idle', exact: true })).toHaveCSS(
    'background-color',
    'rgb(248, 113, 113)',
  );
  await expect(
    page.getByRole('img', { name: 'Sage: Not working: waiting for your input', exact: true }),
  ).toHaveCSS('background-color', 'rgb(248, 113, 113)');
  await page.screenshot({ path: 'test-results/office-with-project.png', fullPage: true });
});
