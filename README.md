# Personal Dashboard

A self-hosted new-tab dashboard that aggregates GitHub pull requests, Google Calendar events, and persistent shortcuts into a single responsive page served at `http://dashboard.localhost`.

## Features

- Time-zone-correct date, live clock, and morning/afternoon/evening greeting
- Pull request metrics (open, draft, merged, closed) from configured GitHub repositories
- Calendar events bucketed by today and upcoming, with all-day and timed event support
- Grouped shortcuts with an add dialog; shortcuts persist to `config/dashboard.json`
- Stale-while-revalidate caching with server-side refresh deduplication
- Partial failure handling: healthy integrations render while failed ones retain cached data
- Chromium new-tab redirect to the dashboard

## Prerequisites

- Node 22
- Docker Desktop (for containerized deployment)
- GitHub fine-grained personal access token with read-only repository access
- Google OAuth 2.0 client with a refresh token for Calendar API access

## Local Development

```bash
npm install
cp env.example .env
# Edit .env: set SESSION_SECRET, APP_KEY, GITHUB_TOKEN, GOOGLE_* credentials
npm run build
npm run start:dev
```

Or with live reload:

```bash
npm run start:dev
```

Navigate to `http://localhost:3000`.

## Configuration

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `SESSION_SECRET` | (required in prod) | Session signing key. Generate with `openssl rand -hex 32` |
| `APP_KEY` | (required in prod) | HMAC signing key. Generate with `openssl rand -hex 32` |
| `DASHBOARD_CONFIG_PATH` | `config/dashboard.json` | Path to the dashboard configuration file |
| `DASHBOARD_CACHE_TTL_SECONDS` | `60` | Cache TTL in seconds (5–3600) |
| `DASHBOARD_REQUEST_TIMEOUT_MS` | `5000` | HTTP request timeout in milliseconds (1000–30000) |
| `DASHBOARD_RETRY_COUNT` | `2` | Number of retries for failed requests (0–4) |
| `GITHUB_TOKEN` | (none) | GitHub fine-grained personal access token |
| `GOOGLE_CLIENT_ID` | (none) | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | (none) | Google OAuth 2.0 client secret |
| `GOOGLE_REFRESH_TOKEN` | (none) | Google OAuth refresh token |

### Dashboard configuration file

`config/dashboard.json`:

```json
{
  "displayName": "Albert",
  "timeZone": "Europe/London",
  "github": {
    "repositories": ["owner/repository"]
  },
  "calendar": {
    "calendarIds": ["primary"],
    "lookaheadDays": 7
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
| `calendar.calendarIds` | Array of calendar IDs; `primary` for the main calendar |
| `calendar.lookaheadDays` | Integer 1–30 |
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

### Google OAuth refresh token

1. Create an OAuth 2.0 client in the Google Cloud Console.
2. Request offline access and the `https://www.googleapis.com/auth/calendar.readonly` scope.
3. Exchange the authorization code for a refresh token using `curl`:

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=<auth_code>" \
  -d "client_id=<client_id>" \
  -d "client_secret=<client_secret>" \
  -d "redirect_uri=http://localhost" \
  -d "grant_type=authorization_code"
```

Store the `refresh_token` value in `GOOGLE_REFRESH_TOKEN`.

## Testing

```bash
npm run test:typecheck   # TypeScript type checking
npm test                 # Vitest unit/integration tests
npm run test:e2e         # Playwright end-to-end tests
npm run test:all         # All of the above
```

## Container Deployment

### Start

```bash
docker compose up -d
```

### Stop

```bash
docker compose down
```

### View logs

```bash
docker compose logs -f
```

### Check health

```bash
curl http://127.0.0.1/healthz
```

The dashboard is available at `http://dashboard.localhost`.

### Configuration backup

Back up `config/dashboard.json` and `.env` separately. The container reads these on start; the image itself contains no credentials or configuration.

### Security boundaries

- Caddy binds exclusively to `127.0.0.1:80`. No public ingress.
- The application container has no host port bindings; traffic flows through Caddy over the `dashboard` bridge network.
- Credentials are read from `.env` at runtime and never baked into the image.
- `config/dashboard.json` is mounted from the host and owned by the user; it is not part of the image.

## Troubleshooting

### GitHub authentication failure

- Confirm the token is a fine-grained PAT, not a classic token.
- Verify the token has `Contents: Read` and `Pull requests: Read` permissions for the selected repositories.
- Check that the token has not expired.

### GitHub rate limiting

GitHub GraphQL allows 5000 points per hour. The dashboard uses up to 4 points per repository per request. If `remaining` hits zero, the service pauses until `resetAt` and reports a rate-limit error in the integration health badge.

### Google 401 on calendar events

If the access token expires, the client discards it, renews from the refresh token, and replays the failed request once. If renewal fails, the calendar integration shows an error state and retains any cached data.

### Dashboard shows stale data

The cache TTL is controlled by `DASHBOARD_CACHE_TTL_SECONDS`. A stale response triggers a background refresh on the next request. Check `docker compose logs app` for refresh activity.

### New tab does not redirect

- Confirm Docker Desktop is running and `docker compose up -d` succeeded.
- Verify the Chromium extension is loaded unpacked (see below).
- The new-tab redirect is active only while the service is running.

## macOS Chromium Setup

### Start the service

```bash
docker compose up -d
```

### Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked**.
4. Select the `src/views/browser-extension` directory in this repository.

### Set as new tab

1. In `chrome://extensions`, find **Personal Dashboard New Tab**.
2. Click **Details**.
3. Under **Chrome URL overrides**, click **Shortcuts**.
4. Set the shortcut for **New tab** to `http://dashboard.localhost/`.

### Optional: set as home page

1. Open `chrome://settings`.
2. Navigate to **Appearance** > **Home**.
3. Enable **Show home button**.
4. Set the URL to `http://dashboard.localhost/`.

### Start Docker at login

1. Open **System Settings** > **General** > **Login Items**.
2. Enable **Docker Desktop**.

New-tab behavior is active only while Docker Desktop is running and the container is up.
