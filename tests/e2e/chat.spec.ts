import { test, expect } from '@playwright/test';

test('one CEO conversation spans projects without URL selection and survives streamed replies and reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let sent = false,
    reads = 0;
  await page.route('**/api/events', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: 'event: changed\ndata: {}\n\n',
    }),
  );
  await page.route('**/api/snapshot', async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    const createdAt = new Date().toISOString();
    snapshot.projects = [
      {
        id: 'map',
        name: 'map-markers',
        path: 'C:\\fixture',
        description: 'A map app',
        summary: '',
        color: '#91b69b',
        createdAt,
      },
      {
        id: 'work',
        name: 'Work',
        path: 'C:\\Work',
        description: '',
        summary: '',
        color: '#91b69b',
        createdAt,
      },
    ];
    snapshot.runtime.state = 'ready';
    snapshot.runtime.authenticated = true;
    snapshot.profile.onboarded = true;
    snapshot.messages = [];
    snapshot.requests = [];
    if (sent) {
      const text =
        reads++ === 0 ? 'Reading the project...' : 'This project displays markers on a map.';
      snapshot.messages = [
        {
          id: 'user',
          projectId: 'map',
          requestId: 'request',
          author: 'user',
          text: 'look at map-makers and explain it',
          createdAt,
        },
        { id: 'answer', projectId: 'map', requestId: 'request', author: 'ceo', text, createdAt },
        {
          id: 'work-answer',
          projectId: 'work',
          requestId: 'other',
          author: 'ceo',
          text: 'Work project has separate assignments.',
          createdAt,
        },
      ];
      snapshot.ceoBusy = reads < 2 ? ['map'] : [];
    }
    await route.fulfill({ response, json: snapshot });
  });
  await page.route('**/api/messages', async (route) => {
    expect(route.request().postDataJSON().projectId).toBe(null);
    sent = true;
    await route.fulfill({ json: { id: 'request', projectId: 'map' } });
  });
  await page.goto('/company?project=obsolete');
  await expect(page.getByRole('heading', { name: 'Your company, at a glance.' })).toBeVisible();
  await page.getByLabel('Message Atlas', { exact: true }).fill('look at map-makers and explain it');
  await expect(page.getByText('Next request: map-markers', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.message-ceo').first()).toContainText(
    'This project displays markers on a map.',
    { timeout: 15000 },
  );
  await expect(page.getByRole('heading', { name: 'Your company, at a glance.' })).toBeVisible();
  await expect(page).not.toHaveURL(/project=/);
  await expect(page.locator('.message-ceo')).toHaveCount(2);
  await page.getByRole('button', { name: /^map-markers$/ }).click();
  await expect(page.locator('.message-ceo')).toHaveCount(2);
  await page.getByLabel('Message Atlas', { exact: true }).fill('Explain Work.');
  await expect(page.locator('.conversation-context')).toContainText('Next request: Work');
  await page.reload();
  await expect(page.locator('.message-ceo').first()).toContainText(
    'This project displays markers on a map.',
  );
  await expect(page.locator('.message-ceo')).toHaveCount(2);
  await expect(page.locator('.conversation-context')).toContainText('All projects');
  expect(errors).toEqual([]);
});
