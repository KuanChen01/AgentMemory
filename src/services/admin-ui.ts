import { renderAdminWorkbenchClientScript } from './admin-ui-client';
import { renderAdminWorkbenchMarkup } from './admin-ui-markup';
import { ADMIN_UI_THEME } from './admin-ui-theme';

export function renderAdminPageHtml(pollIntervalMs: number = 5000): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AgentMemory Admin Workbench</title>
  <link rel="icon" href='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" stop-color="%232f7cf7"/%3E%3Cstop offset="100%25" stop-color="%2377b9ff"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width="64" height="64" rx="18" fill="url(%23g)"/%3E%3Cpath d="M18 24c0-3.314 2.686-6 6-6h16c3.314 0 6 2.686 6 6v4c0 1.105-.895 2-2 2s-2-.895-2-2v-4a2 2 0 0 0-2-2H24a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6c1.105 0 2 .895 2 2s-.895 2-2 2h-6c-3.314 0-6-2.686-6-6V24zm18 11a10 10 0 1 1 20 0 10 10 0 0 1-20 0zm10-6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" fill="white"/%3E%3C/svg%3E' />
  <style>${ADMIN_UI_THEME}</style>
</head>
<body>
  ${renderAdminWorkbenchMarkup()}
  <script>${renderAdminWorkbenchClientScript(pollIntervalMs)}</script>
</body>
</html>`;
}
