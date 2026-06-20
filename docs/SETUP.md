# Setup guide

Get the microsite running end-to-end. Do it **incrementally** — each step is independently testable.

```
Step 1  YouTube live, locally (Direct mode)     → real post + real metrics, no deploy
Step 2  n8n (Orchestrated mode)                 → same workflow via integration layer
Step 3  Cloudflare deploy (Terraform + wrangler)→ live URL, infrastructure as code
Step 4  Facebook (optional second platform)
```

```bash
npm install            # once
```

---

## Step 1 — YouTube live, locally

Goal: publish a real test video and read its metrics from `localhost`, in **Direct** mode.

### 1a. Dummy YouTube channel
Sign in to <https://youtube.com> with a **dedicated/dummy Google account** and create a channel (Settings → Create a channel).

### 1b. Google Cloud project + API
1. <https://console.cloud.google.com> → create a project (e.g. `relay-microsite`).
2. **APIs & Services → Library** → enable **YouTube Data API v3**.

### 1c. OAuth consent screen
1. **APIs & Services → OAuth consent screen** → User type **External** → fill app name + your emails.
2. **Scopes** → add `.../auth/youtube.upload` and `.../auth/youtube.readonly`.
3. Publishing status:
   - **Recommended: Publish app → Production.** Refresh tokens then don't expire. You'll see an "unverified app" warning when authorizing your own account — click *Advanced → continue*. That's expected and fine.
   - *(Alternative)* leave it in **Testing** and add the dummy account under **Test users** — but refresh tokens expire after 7 days.

### 1d. OAuth client
**APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: _Desktop app_.**
Copy the **Client ID** and **Client secret**. (Desktop clients allow the loopback redirect the helper script uses.)

### 1e. Get a refresh token
```bash
node scripts/get-youtube-token.mjs <CLIENT_ID> <CLIENT_SECRET>
```
Open the printed URL, sign in with the **dummy** account, consent. The script prints a ready-to-paste block.

### 1f. Configure + run
```bash
cp .dev.vars.example .dev.vars     # if you haven't yet
# paste YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN into .dev.vars
npm run db:local                   # create the audit_log table locally (once)
npm run dev                        # http://localhost:3000
```
In the UI (mode **Direct**, platform **YouTube**): add a **small** video (≈≤2 MB), **Publish** → you get a video ID. Then **Fetch** → real `views/likes/comments`. The top-bar dot turns **Connected**.

> Uploads from an unverified app are created **private** — metrics still return real numbers. Flip visibility in YouTube Studio if you want public views.

---

## Step 2 — n8n (Orchestrated mode)

Goal: run the same publish/fetch workflow through n8n instead of app code.

**Design — token broker:** n8n does **not** hold any Google credentials. The Worker
owns the YouTube refresh token, mints a short-lived access token, and passes it to
n8n in the request; n8n just executes the HTTP calls. So the only credential n8n
needs is a Header Auth secret to protect its webhook. The committed workflow
(`orchestration/n8n-workflow.json`) is: `Webhook → Prep (init upload / fetch
metrics) → IF(action) → HTTP Request (binary PUT) → Respond`. The binary video is
uploaded by a dedicated **HTTP Request node** (n8n's Code node can't send raw
binary — it UTF-8-corrupts a Buffer body).

### 2a. Start n8n (public)
A deployed Worker can't reach `localhost`, so n8n must be public:
- **n8n Cloud** (free trial) — public out of the box. Easiest.
- or self-host (`cd orchestration && docker compose up -d`) behind a public HTTPS
  origin (e.g. `cloudflared tunnel --url http://localhost:5678`, then set that as
  `WEBHOOK_URL` for n8n).

### 2b. Import + protect the workflow
1. n8n → **Import from File** → `orchestration/n8n-workflow.json` (7 nodes).
2. Open the **Webhook** node → **Header Auth** → **Create new credential**:
   - Name (header): `X-N8N-Auth`
   - Value: a long random string (`openssl rand -hex 24`)
3. **Publish/Activate** the workflow. The production webhook is
   `https://<n8n-host>/webhook/marketing-microsite`.

> No Google/YouTube credential is configured in n8n — the Worker supplies the token.

### 2c. Configure + test
Add to `.dev.vars` (local) and as Worker secrets (prod), then restart:
```
N8N_WEBHOOK_URL=https://<n8n-host>/webhook/marketing-microsite
N8N_WEBHOOK_TOKEN=<the X-N8N-Auth value>
```
In the UI switch mode to **Orchestrated** and run Publish / Fetch — results show **via orchestrated**.

> Tip: YouTube `videos.insert` costs **1600 quota units** (daily default 10,000) and
> has short-window rate limits. Rapid repeated upload tests can transiently 400 —
> space them out.

---

## Step 3 — Deploy (infrastructure as code)

```bash
# Cloudflare creds (account id from the dashboard; token: My Profile → API Tokens →
# permissions: Workers Scripts:Edit, Workers KV:Edit, D1:Edit)
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=…
export TF_VAR_cloudflare_api_token=$CLOUDFLARE_API_TOKEN

# 1) provision KV + D1
cp infra/terraform.tfvars.example infra/terraform.tfvars   # set cloudflare_account_id
terraform -chdir=infra init
terraform -chdir=infra apply

# 2) copy IDs into wrangler.toml
terraform -chdir=infra output
#   → wrangler.toml: [[kv_namespaces]].id  and  [[d1_databases]].database_id / database_name

# 3) create the audit table on the remote D1
npm run db:remote

# 4) secrets (out of source AND out of Terraform state)
npx wrangler secret put YOUTUBE_CLIENT_ID
npx wrangler secret put YOUTUBE_CLIENT_SECRET
npx wrangler secret put YOUTUBE_REFRESH_TOKEN
npx wrangler secret put N8N_WEBHOOK_URL
npx wrangler secret put N8N_WEBHOOK_TOKEN

# 5) build + deploy
npm run deploy        # nuxt build && wrangler deploy → prints the live *.workers.dev URL
```

Open the URL and run both modes against your dummy channel. Done — deployment is fully reproducible from the repo.

---

## Step 4 — Facebook (optional second platform)

1. Create a dummy **Facebook Page** (warm it to ~100+ likes if you want non-zero reach metrics).
2. <https://developers.facebook.com> → create a **Business** app (dev mode).
3. Graph API Explorer → grant `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` → `GET /me/accounts` → copy the **Page access token** (exchange for a long-lived one) and the **Page ID**.
4. Add `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` to `.dev.vars` (and `wrangler secret put` for prod). The **Facebook** tab in the UI lights up.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `… is not configured` | The relevant secret isn't loaded — check `.dev.vars` (local) or `wrangler secret list` (prod). |
| No `refresh_token` from the script | Revoke prior access at <https://myaccount.google.com/permissions> and re-run (it forces `prompt=consent`). |
| Orchestrated call fails from the deployed app | n8n must be **public** + workflow **active** + you used the **production** webhook URL; `X-N8N-Auth` must match. |
| YouTube upload errors on the free Workers plan | Keep the test video small (≈≤2 MB) — base64 decode is the only CPU-bound step (10 ms cap), or use Workers Paid. |
| Audit log empty after deploy | Run `npm run db:remote` and confirm `wrangler.toml` has the real D1 `database_id`. |
