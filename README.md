# Personal Dashboard

A self-hosted new-tab dashboard that combines GitHub pull requests and persistent shortcuts in one responsive page.

## Features

- Time-zone-correct date, live clock, and morning/afternoon/evening greeting
- Pull request metrics (open, draft, merged, closed) from configured GitHub repositories
- Searchable pull requests from every selected repository or organization wildcard
- Grouped, searchable shortcuts managed from Settings and persisted in SQLite
- Shortcut JSON export/import for moving shortcuts between instances
- Stale-while-revalidate caching with server-side refresh deduplication
- Partial failure handling: healthy integrations render while failed ones retain cached data

## Prerequisites

- Node 22
- Docker Desktop (for containerized deployment)
- GitHub fine-grained personal access token with read-only repository access

## Local Development

```bash
npm install
cp env.example .env
# Edit .env: set SESSION_SECRET, APP_KEY, PORT, and APP_URL
npm run build
npm run start:dev
```

Or with live reload:

```bash
npm run start:dev
```

Navigate to the `APP_URL` configured in `.env`.

## Configuration

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `SESSION_SECRET` | (required in prod) | Session signing key. Generate with `openssl rand -hex 32` |
| `APP_KEY` | (required in prod) | HMAC signing key. Generate with `openssl rand -hex 32` |
| `DASHBOARD_CONFIG_PATH` | `config/dashboard.json` | Path to the dashboard configuration file |
| `DASHBOARD_CACHE_TTL_SECONDS` | `60` | Cache TTL in seconds (5–3600) |
| `GITHUB_REPOSITORY_CACHE_TTL_SECONDS` | `900` | GitHub repository catalog cache TTL in seconds (60–86400) |
| `DASHBOARD_REQUEST_TIMEOUT_MS` | `5000` | HTTP request timeout in milliseconds (1000–30000) |
| `DASHBOARD_RETRY_COUNT` | `2` | Number of retries for failed requests (0–4) |

### Dashboard configuration file

`config/dashboard.json` is used only to initialize an empty SQLite database. After the first startup, SQLite is the source of truth and changes are made from the Settings page.

Example:

```json
{
  "displayName": "Albert",
  "timeZone": "Europe/London",
  "shortcutLimit": 8,
  "github": {
    "windowDays": 7,
    "repositories": []
  },
  "shortcutGroups": [
    {
      "id": "shortcuts",
      "label": "Shortcuts",
      "shortcuts": [
        { "id": "jira", "label": "Jira board", "url": "https://example.atlassian.net/jira/your-work", "icon": "jira" },
        { "id": "obsidian", "label": "Obsidian vault", "url": "obsidian://open", "icon": "obsidian" }
      ]
    }
  ]
}
```

| Field | Constraints |
|---|---|
| `displayName` | 1–60 characters, trimmed |
| `timeZone` | Valid IANA time zone (e.g. `America/New_York`) |
| `github.repositories` | Array of `owner/repository` strings, unique |
| `github.windowDays` | Integer 1–30; defaults to 7 |
| `shortcutLimit` | Integer 1–50; defaults to 8 |
| `shortcutGroups[].id` | Lowercase `[a-z0-9][a-z0-9-]{0,39}`, unique per group |
| `shortcuts[].id` | Lowercase `[a-z0-9][a-z0-9-]{0,39}`, unique within group |
| `shortcuts[].label` | 1–60 characters, trimmed |
| `shortcuts[].icon` | One of: `calendar`, `github`, `jira`, `link`, `obsidian` |
| `shortcuts[].url` | `https://`, `http://` (with host, no credentials), or `obsidian://` |

### GitHub token scope

Generate a fine-grained token at GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens.

- Select "Only select repositories" and choose the repositories to display.
- Set "Permissions" > "Contents" to "Read-only".
- Set "Pull requests" to "Read-only".

The token needs no additional permissions.

## Testing

```bash
npm run test:typecheck   # TypeScript type checking
npm test                 # Vitest unit/integration tests
npm run test:e2e         # Playwright end-to-end tests
npm run test:all         # All of the above
```

## Container Deployment

### Initial setup

1. Copy and edit the environment file. `APP_URL` must use the same hostname you open in the browser.

```bash
cp env.example .env
```

2. Review `config/dashboard.json`. It seeds an empty database once; it does not drive the running application afterward.

3. Build the image and create a persistent SQLite volume.

```bash
docker build -t personal-dashboard .
docker volume create personal-dashboard-data
```

4. Start the container. This example assumes `PORT=3333` and `APP_URL=http://localhost:3333` in `.env`.

```bash
docker run -d \
  --name personal-dashboard \
  --restart unless-stopped \
  --env-file .env \
  --env DB_PATH=/data/dashboard.db \
  --volume personal-dashboard-data:/data \
  --publish 127.0.0.1:3333:3333 \
  personal-dashboard
```

At every container start, the entrypoint applies only pending MikroORM migrations. It then seeds `config/dashboard.json` only when the dashboard settings table is empty, and finally starts PM2.

Open `http://localhost:3333`, go to Settings, and save a GitHub token. GitHub credentials are stored in SQLite and are never included in shortcut exports.

### Stop and start

```bash
docker stop personal-dashboard
docker start personal-dashboard
```

### View logs

```bash
docker logs -f personal-dashboard
```

### Check health

```bash
curl http://localhost:3333/healthz
curl http://localhost:3333/readyz
```

The dashboard is available at the `APP_URL` configured in `.env`.

### Configuration backup

Back up the `personal-dashboard-data` volume and `.env`. `config/dashboard.json` is only the initial seed. Shortcut exports are available from Settings and intentionally exclude GitHub credentials.

### Security boundaries

- The example `docker run` command publishes the application exclusively on `127.0.0.1`. No public ingress or port 80 binding is required.
- Credentials are read from `.env` at runtime and never baked into the image.
- Runtime configuration is stored in the persistent SQLite volume.

## Troubleshooting

### GitHub authentication failure

- Confirm the token is a fine-grained PAT, not a classic token.
- Verify the token has `Contents: Read` and `Pull requests: Read` permissions for the selected repositories.
- Check that the token has not expired.

### GitHub rate limiting

GitHub GraphQL allows 5000 points per hour. The dashboard uses up to 4 points per repository per request. If `remaining` hits zero, the service pauses until `resetAt` and reports a rate-limit error in the integration health badge.

### Dashboard shows stale data

The cache TTL is controlled by `DASHBOARD_CACHE_TTL_SECONDS`. A stale response triggers a background refresh on the next request. Check `docker logs personal-dashboard` for refresh activity.

## macOS Chromium Setup

### Start the service

```bash
docker start personal-dashboard
```

### Optional: set as home page

1. Open `chrome://settings`.
2. Navigate to **Appearance** > **Home**.
3. Enable **Show home button**.
4. Set the URL to the `APP_URL` configured in `.env`.

### Start Docker at login

1. Open **System Settings** > **General** > **Login Items**.
2. Enable **Docker Desktop**.

New-tab behavior is active only while Docker Desktop is running and the container is up.
