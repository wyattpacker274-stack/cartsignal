# CartSignal — deploy runbook

Target: a scanned index that republishes itself weekly, emails you the diff, and
delivers a paid fix pack with no manual step.

Total monthly cost at this scale: **$0**. Domain is the only optional spend (~$10/yr).

---

## 0. What runs where

| Piece | Runs on | Trigger |
|---|---|---|
| Scan + render | GitHub Actions (ubuntu runner) | cron Mon 06:00 UTC, or manual |
| Public index | GitHub Pages | after every successful scan |
| Snapshot history | git (`out/history/`) | committed by the Action |
| Weekly digest | Resend HTTP API | inside the scan job |
| Payment | Stripe Payment Link | customer click |
| Fulfillment | Cloudflare Worker -> GitHub `repository_dispatch` -> Action | Stripe webhook |
| Delivery | Resend, attachment | inside the fulfill job |

---

## 1. GitHub repo

1. Create a **new repository** named `cartsignal`.
2. Leave it **public** (Pages on a private repo requires a paid plan). The code is not the moat.
3. Locally, in `cartsignal/`:

```
git init
git add .
git commit -m "cartsignal initial"
git branch -M main
git remote add origin https://github.com/<you>/cartsignal.git
git push -u origin main
```

**Expect:** the repo shows `src/`, `data/`, `out/`, `.github/`.

---

## 2. Resend (email)

1. Go to resend.com -> **Sign up** (free).
2. **API Keys** -> **Create API Key** -> name it `cartsignal` -> permission **Sending access**.
3. Copy the key (`re_...`). It is shown once.
4. Optional but recommended: **Domains** -> **Add Domain** -> add the DNS records it shows.
   Until a domain is verified you may only send **from** `onboarding@resend.dev`, and only to your own account email.

**Expect:** a key starting with `re_`, and for a verified domain a green **Verified** badge.

---

## 3. GitHub Actions secrets and variables

Repo -> **Settings** -> **Secrets and variables** -> **Actions**.

**Secrets** (New repository secret):

| Name | Value |
|---|---|
| `RESEND_API_KEY` | `re_...` |
| `CARTSIGNAL_OWNER_EMAIL` | your email |

**Variables** (New repository variable):

| Name | Value |
|---|---|
| `CARTSIGNAL_BASE_URL` | `https://<you>.github.io/cartsignal` (update in step 5 if you use Pages root) |
| `CARTSIGNAL_FROM` | `CartSignal <onboarding@resend.dev>` until your domain verifies |
| `CARTSIGNAL_BRAND` | `CartSignal` |

**Expect:** five entries listed, secrets masked.

---

## 4. Turn on Pages

1. Repo -> **Settings** -> **Pages**.
2. **Build and deployment** -> **Source** -> choose **GitHub Actions**.
3. Do not pick a branch. The workflow supplies the artifact.

**Expect:** "GitHub Pages source saved" and, after the first run, a green deployment
with a URL like `https://<you>.github.io/cartsignal/`.

If the site renders but CSS is missing, your `CARTSIGNAL_BASE_URL` is wrong — fix the
variable and re-run the workflow.

---

## 5. First run

1. Repo -> **Actions** -> **cartsignal** -> **Run workflow** -> **Run workflow**.
2. Wait ~2-4 minutes.

**Expect:** a green run. Then:
- the Pages URL serves the leaderboard,
- `out/history/<date>.json` and `out/diff.json` appear as a new commit,
- your inbox has the digest (if `RESEND_API_KEY` is set and the recipient is allowed).

---

## 6. Stripe payment link

1. stripe.com -> **Sign up** / log in, activate the account.
2. **Product catalog** -> **Add product**.
   - Name: `Agent Readiness Fix Pack`
   - Price: `$299` one-time
3. On the product -> **Create payment link**.
4. In the link editor:
   - **After payment** -> **Show confirmation page** -> add a message: "Your pack is on its way to this email address."
   - **Collect customers' information** -> require **Email**.
   - **Custom fields** -> add one: label `Store domain`, type **Text**, key `domain`, required.
   - **Metadata** (optional fallback): `domain` = blank is fine; the custom field is enough.
5. Save and copy the link (`https://buy.stripe.com/...`).

Put that link on the index page. It currently points to `https://cartsignal.dev/audit`;
change it in `src/report.js` to your payment link, or add a redirect from that path.

**Expect:** a working hosted checkout that shows a "Store domain" text box.

---

## 7. Fulfillment Worker (Cloudflare, free)

1. dash.cloudflare.com -> **Workers & Pages** -> **Create** -> **Worker** -> name `cartsignal-stripe` -> **Deploy**.
2. **Edit code** -> paste `worker/stripe-fulfill.js` -> **Deploy**.
3. **Settings** -> **Variables and Secrets** -> add **Secrets**:

| Name | Value |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | from step 8 |
| `GITHUB_TOKEN` | a fine-grained PAT (below) |
| `GITHUB_REPO` | `<you>/cartsignal` |

4. Create the PAT: github.com -> **Settings** -> **Developer settings** ->
   **Personal access tokens** -> **Fine-grained tokens** -> **Generate new token**.
   - Repository access: **Only select repositories** -> `cartsignal`
   - Permissions -> **Contents: Read and write** (dispatch requires write)
   - Expiration: 90 days
5. Copy the worker URL (`https://cartsignal-stripe.<you>.workers.dev`).

**Expect:** visiting the worker URL in a browser prints `cartsignal stripe bridge: ok`.

---

## 8. Wire the Stripe webhook

1. Stripe -> **Developers** -> **Webhooks** -> **Add endpoint**.
2. Endpoint URL: the worker URL from step 7.
3. Events: **checkout.session.completed** only.
4. **Add endpoint** -> reveal **Signing secret** (`whsec_...`) -> paste into the Worker secret
   `STRIPE_WEBHOOK_SECRET` -> **Deploy** the worker again.

**Expect:** a Stripe test checkout (`4242 4242 4242 4242`) triggers:
Stripe event -> worker 200 -> Actions run named `cartsignal` (trigger: repository_dispatch)
-> an email with `...-agent-readiness-pack.zip` attached.

If the Actions run does not appear, the PAT is missing `Contents: write` or `GITHUB_REPO`
is misspelled.

---

## 9. Verify checklist

```
[ ] Actions scan job green
[ ] Pages URL shows the leaderboard
[ ] out/history/<today>.json committed
[ ] digest email received (or `node src/cli.js digest` prints it)
[ ] Stripe test payment completes
[ ] Worker returns 200 to Stripe
[ ] repository_dispatch run appears in Actions
[ ] zip arrives by email and opens
[ ] a second manual run reports "N changed vs <yesterday>"
```

---

## 10. Local commands

```
node src/cli.js scan --limit 5        # quick scan
node src/cli.js digest                # render + print the digest
node src/cli.js digest --send         # email it
node src/cli.js fulfill --domain x.com --email you@x.com
node src/cli.js outreach              # write draft messages
node src/cli.js history               # snapshot list with means
node src/cli.js serve                 # http://localhost:4173
```

With a `.env` file (copy `.env.example`):

```
node --env-file=.env src/cli.js scan
```

---

## 11. Cost

| Item | Free tier | When it stops being free |
|---|---|---|
| GitHub Actions | 2,000 min/mo (public repos: unlimited) | private repo + heavy scans |
| GitHub Pages | 100 GB/mo bandwidth | heavy traffic |
| Resend | 100 emails/day, 3,000/mo | ~100 packs/day |
| Cloudflare Workers | 100k requests/day | never at this volume |
| Stripe | no monthly fee | 2.9% + 30c per sale |

---

## 12. Known sharp edges

- **Private repo + Pages** needs a paid GitHub plan. Use Cloudflare Pages instead (connects to a private repo, free).
- **Resend without a verified domain** can only send to your own account email. Verify the domain before selling.
- **`CARTSIGNAL_BASE_URL`** is baked into every link in the index, digest, and outreach drafts. Set it before the first real run.
- **Bot walls** (429/403) are scored `N/A`, not `F`. Re-running later often clears a rate limit.
- **The scan overwrites `out/data.json`.** Running with `--limit` replaces the full index; use it for testing only.
