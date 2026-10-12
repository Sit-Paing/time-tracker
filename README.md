# Time Ledger (synced)

Daily planner, labeled timer and habit tracker that syncs across all your devices.
Runs free on Cloudflare Pages, with a Cloudflare D1 database holding your data.

```
public/              the app (served as the website)
  index.html         Plan · Time · Habits
  sw.js              offline support
  manifest.webmanifest, icon-*.png
  _headers           no-cache rules so updates show at once
functions/api/sync.js  the sync API at /api/sync (runs on Cloudflare)
```

## One-time setup

### 1. GitHub
Create a repository and upload **everything in this folder** (keep the `public` and `functions` folders as they are).

### 2. Cloudflare Pages
Dashboard → **Workers & Pages** → **Create** → **Pages** → **Import an existing Git repository** → pick the repo.

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | *(leave empty)* |
| Build output directory | `public` |

Save and Deploy. You get `https://<project>.pages.dev`.

### 3. Database
Dashboard → **Storage & Databases** → **D1 SQL Database** → **Create** → name it `time-ledger`.
The app creates its table automatically on first sync.

### 4. Connect the database and your sync key
In your Pages project → **Settings**:

- **Bindings** → **Add** → **D1 database** → Variable name `DB` → database `time-ledger`.
- **Variables and Secrets** → **Add** → Type **Secret** → Name `SYNC_KEY` → Value: a long passphrase only you know
  (for example four or five random words). Anyone with this key can read and change your data.

Then **Deployments** → latest deployment → **⋯** → **Retry deployment** so the settings take effect.

### 5. Each device
Open your `pages.dev` address → **Time** tab → **Sync & backup** → enter the sync key → **Connect**.
On a phone, tap **Install app** (or Chrome **⋮ → Install app**) to open it without the browser bar.

## How sync works
- Every change is saved on the device first, then uploaded within a couple of seconds. Offline changes upload when you reconnect.
- Devices check for changes every 20 seconds while open, and when you switch back to the app.
- Each time entry, plan day and habit month is stored separately, and the newest change wins for each one.
- The running timer syncs too: start it on one device, stop it on another.

## Moving existing data in
- From the older phone app: **Export backup** there → **Import backup** here (entries are merged, not replaced).
- Habit history from Excel: **Habits** tab → **Import from Excel**.

## Updating the app
Replace the files in GitHub. Cloudflare redeploys within a minute. Your data stays in D1.
The footer shows the version.

## Free-tier limits
Cloudflare's free plan covers this comfortably (D1: 5 GB storage, millions of reads per day).
