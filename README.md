<h1 align="center">Yoda</h1>

`yoda` is a private, self-hosted dashboard for replacing your browser home page with GitHub pull request context and persistent quick links.

## Quick start

```bash
npm install
cp env.example .env
npm run migration:run
npm run dashboard:setup
npm run start:dev
```

Open the URL configured by `APP_URL` in `.env`.

The default example uses `http://localhost:3000`, while the server fallback port is `3008` when `PORT` is not set.

## Configuration

### Required production variables

Set these before running with `NODE_ENV=production`:

```bash
SESSION_SECRET=$(openssl rand -hex 32)
APP_KEY=$(openssl rand -hex 32)
```

Development falls back to built-in local-only keys if these variables are not set.

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode: `development`, `production`, or `test`. |
| `PORT` | `3008` | HTTP server port when not overridden by `.env`. |
| `APP_NAME` | `The Boring Architecture` | Page title fallback. |
| `APP_URL` | `http://localhost:3000` | Canonical app URL used by the browser and deployment docs. |
| `SESSION_SECRET` | development fallback | Session signing key. Required in production. |
| `APP_KEY` | development fallback | HMAC signing key. Required in production. |
| `DB_PATH` | `yoda.db` | SQLite database path. Use a mounted path in Docker. |
| `BACKUP_PATH` | `backups` | Directory used for scheduled and manual database backups. |
| `DASHBOARD_CONFIG_PATH` | `config/dashboard.json` | Seed file path for first-time dashboard setup. |
| `DASHBOARD_CACHE_TTL_SECONDS` | `180` | Dashboard cache TTL. Must be 5–3600 seconds. |
| `GITHUB_REPOSITORY_CACHE_TTL_SECONDS` | `900` | GitHub repository catalog cache TTL. Must be 60–86400 seconds. |
| `DASHBOARD_REQUEST_TIMEOUT_MS` | `5000` | GitHub request timeout. Must be 1000–30000 ms. |
| `DASHBOARD_RETRY_COUNT` | `2` | Retry count for failed dashboard requests. Must be 0–4. |
| `DISABLE_SSR` | `false` | Set to `true` to serve a client-only shell. |
| `TRUST_PROXY` | `loopback` | Express trust proxy setting for reverse proxy deployments. |

See `env.example` for mail, storage, session, and rate-limit options inherited from the app template.

## First-run seed

`config/dashboard.json` seeds an empty SQLite database. After setup, SQLite is the source of truth and dashboard changes are made from Settings.

```json
{
  "displayName": "Albert",
  "timeZone": "Europe/London",
  "shortcutLimit": 8,
  "github": {
    "windowDays": 7,
    "repositoryScopes": []
  },
  "shortcutGroups": [
    {
      "id": "shortcuts",
      "label": "Quick links",
      "shortcuts": [
        {
          "id": "jira",
          "label": "Jira board",
          "url": "https://example.atlassian.net/jira/your-work",
          "icon": "jira"
        }
      ]
    }
  ]
}
```

Run the seed manually with:

```bash
npm run dashboard:setup
```

The Docker entrypoint runs this automatically after pending migrations.

## GitHub setup

1. Open Settings in the dashboard.
2. Add a GitHub personal access token.
3. Select repositories or scopes for pull request tracking.
4. Save settings.

For fine-grained personal access tokens, grant read-only access to the repositories you want to display and enable read permissions for contents and pull requests.

GitHub credentials are stored in SQLite and are not included in quick link exports.

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Runs page generation, server reload, client build watch, and SSR build watch. |
| `npm run build` | Builds client assets, SSR bundle, and server output. |
| `npm run start:prod` | Starts the compiled server from `dist/index.js`. |
| `npm run work:dev` | Starts the worker with `tsx`. |
| `npm run work:prod` | Starts the compiled worker from `dist/worker.js`. |
| `npm run migration:run` | Applies pending MikroORM migrations. |
| `npm run migration:create` | Creates a new MikroORM migration. |
| `npm run migration:revert` | Rolls back the latest migration. |
| `npm run migration:status` | Checks migration status. |
| `npm run dashboard:setup` | Seeds dashboard settings and quick links when the database is empty. |
| `npm run test:typecheck` | Runs TypeScript checks for tests. |
| `npm test` | Runs Vitest integration tests. |
| `npm run test:e2e` | Runs Playwright tests. |
| `npm run test:all` | Runs type checks, Vitest, and Playwright. |

## Docker deployment

Copy and edit the environment file:

```bash
cp env.example .env
```

Build and start the app using the local `yoda.db` database:

```bash
docker compose up --build --detach
```

At startup, the container applies pending migrations, seeds an empty dashboard database from `config/dashboard.json`, and starts the app and scheduled-task worker. The Compose file mounts `./yoda.db` as the live database and `./backups` as the backup directory.

Useful commands:

```bash
docker compose logs --follow app
docker compose stop app
docker compose start app
docker compose down
```

## Health checks

```bash
curl http://localhost:3336/healthz
curl http://localhost:3336/readyz
```

## Backups

Use Settings → Backups to choose the backup frequency and retention period, or create one immediately. Retention removes expired backups but always keeps the newest backup; no cleanup runs while scheduled backups are off. Docker writes backups to `./backups`; local development uses `BACKUP_PATH` (default: `backups`).

Back up the `.env` file separately because database backups do not contain runtime secrets stored there.

Quick link exports are useful for moving dashboard links between instances, but they intentionally exclude the GitHub token and runtime secrets.

## Troubleshooting

### The dashboard has no pull requests

- Confirm a GitHub token is saved in Settings.
- Confirm repositories are selected in Settings.
- Confirm the token has read access to the selected repositories.

### GitHub requests are rate limited

GitHub GraphQL rate limits are reported through integration health. Increase `DASHBOARD_CACHE_TTL_SECONDS`, reduce selected repositories, or wait until the reset time.

### Changes do not appear immediately

Dashboard data is cached by `DASHBOARD_CACHE_TTL_SECONDS`. Settings and quick link mutations invalidate the cached snapshot, while stale external data refreshes in the background.

### Container data disappeared

The included Compose file bind-mounts `./yoda.db` to `/data/yoda.db`. Run Compose from the repository directory and do not delete or replace that host file.

## Documentation

- `docs/the-boring-architecture.md` documents the underlying application template and runtime architecture.

## License

MIT
