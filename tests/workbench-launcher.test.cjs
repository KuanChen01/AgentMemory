const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  buildAdminWorkbenchUrls,
  buildBrowserOpenCommand,
  classifyOverviewProbe,
  isReusableOverviewPayload,
  waitForWorkbenchReady,
} = require('../dist/services/workbench-launcher.js');

test('workbench launcher recognizes reusable worker overview payloads', () => {
  const payload = {
    policy: { readEnabled: true, writeEnabled: true, updatedAt: '2026-06-03 12:00:00' },
    stats: {
      observations: 3,
      sessions: 1,
      projects: 1,
      agents: 1,
      currentStateFacts: 2,
    },
    projects: ['E:/Repo/A'],
    agents: ['codex'],
    refreshedAt: '2026-06-03T12:00:00.000Z',
  };

  assert.equal(isReusableOverviewPayload(payload), true);
  assert.equal(classifyOverviewProbe({ ok: true, status: 200, payload }), 'reuse-existing');
  assert.equal(classifyOverviewProbe({ ok: false, status: 503, payload: null }), 'start-worker');
});

test('workbench launcher waits for readiness probe and builds stable admin urls', async () => {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    if (requests < 2) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'warming up' }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        policy: { readEnabled: true, writeEnabled: true, updatedAt: '2026-06-03 12:00:00' },
        stats: {
          observations: 2,
          sessions: 1,
          projects: 1,
          agents: 1,
          currentStateFacts: 1,
        },
        projects: ['E:/Repo/A'],
        agents: ['codex'],
        refreshedAt: '2026-06-03T12:00:00.000Z',
      })
    );
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const urls = buildAdminWorkbenchUrls(port);
    assert.equal(urls.adminUrl, `http://127.0.0.1:${port}/admin`);
    assert.equal(urls.overviewUrl, `http://127.0.0.1:${port}/admin/api/overview`);
    assert.deepEqual(buildBrowserOpenCommand(urls.adminUrl), {
      command: 'cmd',
      args: ['/c', 'start', '', urls.adminUrl],
    });

    const result = await waitForWorkbenchReady(urls.overviewUrl, {
      attempts: 3,
      intervalMs: 10,
      timeoutMs: 200,
    });

    assert.equal(result.ready, true);
    assert.equal(result.probe.status, 200);
    assert.equal(requests, 2);
  } finally {
    server.close();
  }
});
