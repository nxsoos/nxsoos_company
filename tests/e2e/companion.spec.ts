import { test, expect } from '@playwright/test';
test('visualizer-only view does not activate Company or expose execution controls', async ({
  page,
}) => {
  let activated = 0;
  await page.route('**/api/company/activate', async (route) => {
    activated++;
    await route.continue();
  });
  await page.goto('/visualizer');
  await expect(page.getByRole('main', { name: 'Codex headquarters' })).toBeVisible();
  await expect(page.getByText('The work behind the conversation.')).toHaveCount(0);
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Agent team' })).toBeVisible();
  await expect(page.locator('.hq-member')).toHaveCount(5);
  await expect(page.locator('.hq-member-details')).toHaveCount(5);
  for (const card of await page.locator('.hq-member').all()) {
    await expect(card.locator('dt')).toHaveText(['Office', 'Project', 'Activity']);
    await expect(card.locator('.hq-member-role')).not.toBeEmpty();
    await expect(card.getByRole('button', { name: /Inspect.*conversation/ })).toHaveCount(1);
  }
  await expect(page.getByRole('region', { name: 'Selected agent details' })).toHaveCount(0);
  const team = page.getByRole('complementary', { name: 'Agent team' });
  expect(await team.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
  for (const height of [1080, 900, 768, 600]) {
    await page.setViewportSize({ width: 1440, height });
    for (const card of await page.locator('.hq-member').all()) {
      await expect(card).toBeInViewport({ ratio: 1 });
    }
    expect(await team.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.observed-card')).toHaveCount(0);
  expect(activated).toBe(0);
  await page.screenshot({ path: 'test-results/companion-empty.png', fullPage: true });
});
test('observed instances, source filters, and read-only conversations', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/companion/snapshot', async (route) => {
    const timestamp = new Date().toISOString();
    const base = {
      rootId: 'root',
      source: 'cli',
      cwd: 'C:\\Projects\\Personal',
      state: 'working',
      phase: 'Implementing a feature',
      createdAt: timestamp,
      updatedAt: timestamp,
      profileRevision: 'revision',
      coverage: 'complete',
      coverageNote: 'Supported transcript captured.',
      transcriptPath: null,
    };
    await route.fulfill({
      json: {
        companyActive: false,
        conflicts: [],
        integration: {
          installed: true,
          hooksEnabled: true,
          cli: 'verified',
          ide: 'unverified',
          notes: [],
        },
        sessions: [
          { ...base, id: 'root', parentId: null, role: 'ceo', name: 'Atlas' },
          { ...base, id: 'worker-one', parentId: 'root', role: 'developer', name: 'Nova',
            cwd:'C:\\Projects\\movie-list', activeProject:{path:'C:\\Projects\\map-markers',name:'map-markers',observedAt:timestamp,evidence:'tool-workdir'} },
          {
            ...base,
            id: 'worker-two',
            parentId: 'root',
            role: 'developer',
            name: 'Nova',
            state: 'waiting',
            phase: 'Waiting for approval',
          },
        ],
        messages: [
          {
            id: 'u',
            sessionId: 'root',
            turnId: 'turn',
            role: 'user',
            text: 'Make this feature easier to understand.',
            createdAt: timestamp,
          },
          {
            id: 'a',
            sessionId: 'root',
            turnId: 'turn',
            role: 'assistant',
            text: 'I assigned the implementation and will explain the verified result.',
            createdAt: timestamp,
          },
        ],
      },
    });
  });
  await page.goto('/visualizer');
  await expect(page.getByRole('status', { name: 'Working agents' })).toContainText('2 working now');
  const novaCard=page.getByRole('article',{name:'Nova details',exact:true});
  await expect(novaCard).toContainText('map-markers');
  await expect(novaCard).not.toContainText('movie-list');
  await page.getByRole('button',{name:'Inspect Nova conversation',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Nova',exact:true})).toContainText('Session workspace: C:\\Projects\\movie-list');
  await expect(page.getByRole('dialog',{name:'Nova',exact:true})).toContainText('Project: map-markers');
  await page.getByRole('button',{name:'Close conversation inspector',exact:true}).click();
  await page.getByRole('button', { name: 'Codex connection' }).click();
  await expect(page.getByRole('dialog', { name: 'Your Codex connection' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await expect(page.locator('.hq-member')).toHaveCount(5);
  for (const card of await page.locator('.hq-member').all()) {
    await expect(card).toBeInViewport({ ratio: 1 });
  }
  const pageSize = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    viewport: innerHeight,
  }));
  expect(pageSize.height).toBeLessThanOrEqual(pageSize.viewport);
  await page.screenshot({ path: 'test-results/companion-fixed-team.png', fullPage: true });
  await page.getByRole('button', { name: /Connected conversations/ }).click();
  await expect(page.locator('.observed-card')).toHaveCount(3);
  await expect(page.getByRole('img', { name: 'Nova: Working', exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Nova: Waiting for input', exact: true }),
  ).toBeVisible();
  await page.locator('.observed-card').first().click();
  await expect(page.getByRole('dialog', { name: 'Atlas', exact: true })).toBeVisible();
  await expect(
    page.getByText('Make this feature easier to understand.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close conversation inspector' }).click();
  await page.getByLabel('Session source').selectOption('ide');
  await page.getByRole('button', { name: /Connected conversations/ }).click();
  await expect(page.locator('.observed-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close connected conversations' }).click();
  await page.getByLabel('Session source').selectOption('cli');
  await page.getByRole('button', { name: /Connected conversations/ }).click();
  await expect(page.locator('.observed-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Close connected conversations' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/companion-live.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('office groups nine sessions into role offices and remains stable across source filters', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/companion/snapshot', (route) => {
    const timestamp = new Date().toISOString();
    const roles = [
      'ceo',
      'researcher',
      'developer',
      'reviewer',
      'designer',
      'ceo',
      'developer',
      'researcher',
      'ceo',
    ];
    return route.fulfill({
      json: {
        companyActive: false,
        conflicts: [{ projectName: 'Example', projectId: 'example' }],
        integration: { installed: true, cli: 'verified', ide: 'unverified', notes: [] },
        messages: [],
        sessions: roles.map((role, index) => ({
          id: 'instance-' + index,
          rootId: 'instance-0',
          parentId: index ? 'instance-0' : null,
          source: index === 8 ? 'ide' : 'cli',
          role,
          name: role === 'developer' ? 'Nova' : role === 'ceo' ? 'Atlas' : 'Employee ' + index,
          cwd:
            role === 'developer'
              ? 'C:\\Projects\\Very-long-project-folder-name-' + index
              : 'C:\\Projects\\Example',
          state: index % 2 ? 'idle' : 'working',
          phase: 'Active task',
          createdAt: timestamp,
          updatedAt: timestamp,
          profileRevision: 'v1',
          coverage: 'complete',
          coverageNote: 'Captured',
          transcriptPath: null,
        })),
      },
    });
  });
  await page.goto('/visualizer');
  await page.setViewportSize({ width: 1440, height: 768 });
  await expect(page.getByText(/Browser assignments and Codex are both active/)).toBeVisible();
  for (const card of await page.locator('.hq-member').all())
    await expect(card).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  const project = page
    .getByRole('article', { name: 'Nova details', exact: true })
    .locator('.hq-project-value');
  await project.focus();
  expect(
    await project.evaluate((element) => getComputedStyle(element, '::after').content),
  ).toContain('Very-long-project-folder-name');
  await expect(page.locator('.hq-member')).toHaveCount(5);
  await page.getByRole('button', { name: /Connected conversations/ }).click();
  await expect(page.locator('.observed-card')).toHaveCount(9);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.canvas-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close connected conversations' }).click();
  await page.getByLabel('Session source').selectOption('ide');
  await page.getByRole('button', { name: /Connected conversations/ }).click();
  await expect(page.locator('.observed-card')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close connected conversations' }).click();
  await page.getByLabel('Session source').selectOption('all');
  await page.getByRole('button', { name: /Connected conversations/ }).click();
  await expect(page.locator('.observed-card')).toHaveCount(9);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.waitForTimeout(300);
  await expect(page.locator('.canvas-error')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('office motion can be paused and mobile team details and conversation drawer stay usable', async ({
  page,
}) => {
  await page.goto('/visualizer');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await page.waitForTimeout(250);
  const still = await canvas.screenshot();
  await page.waitForTimeout(250);
  expect((await canvas.screenshot()).equals(still)).toBe(true);
  await page.getByRole('button', { name: 'Resume animation', exact: true }).click();
  await page.waitForTimeout(350);
  expect((await canvas.screenshot()).equals(still)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(250);
  const reduced = await canvas.screenshot();
  await page.waitForTimeout(250);
  expect((await canvas.screenshot()).equals(reduced)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Show agent team' }).click();
  await expect(page.getByRole('complementary', { name: 'Agent team' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Nova details', exact: true })).toContainText(
    'Development room',
  );
  await page.getByRole('article', { name: 'Sage details', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('article', { name: 'Sage details', exact: true })).toBeInViewport();
  expect(
    await page.locator('.hq-team').evaluate((element) => getComputedStyle(element).overflowY),
  ).toBe('visible');
  await page.getByRole('button', { name: 'Close agent team' }).click();
  await page.getByRole('button', { name: /Connected conversations/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Connected conversations', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
