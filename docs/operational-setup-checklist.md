# Setup — Operational Checklist

Consolidated guide for enabling the billing (Asaas), Pro photos (R2), anti-bot (Turnstile), and NFC-e import (Gemini, Infosimples) features.

---

## 1. Asaas — Payment (Billing)

### What it is
A payment platform that processes monthly Pro subscriptions via Pix or card. Without a credential: `/billing` routes return 501; the app works without charges.

### Step by step

1. **Create a sandbox (test) account**
   - Go to [sandbox.asaas.com](https://sandbox.asaas.com)
   - Sign up with a company email

2. **Generate an API key (sandbox)**
   - In the sandbox panel, go to **Settings → API Credentials**
   - Copy the key that starts with `$aact_hmlg_` (sandbox)

3. **Configure the webhook**
   - In the panel, go to **Webhooks**
   - Add: `https://api.grosify.com.br/webhooks/asaas`
   - Generate an authentication token: `openssl rand -hex 24` (run it in the terminal)
   - Events to enable: `PAYMENT_CONFIRMED`, `RECEIVED`, `OVERDUE`, `REFUNDED`, chargebacks, `SUBSCRIPTION_DELETED`, `INACTIVATED`

4. **Environment variables** (Railway — Pro)
   ```
   ASAAS_API_KEY=<sandbox key $aact_hmlg_...>
   ASAAS_WEBHOOK_TOKEN=<token generated above>
   ASAAS_BASE_URL=https://api.sandbox.asaas.com/v3
   ```

5. **Validation test**
   - In the sandbox panel, create a customer and a charge
   - Pay with a CPF (any one works in sandbox)
   - Check that the household becomes Pro in the app

6. **Promote to production**
   - Create a production account at [asaas.com](https://asaas.com)
   - Repeat steps 2–3 (the API key will be `$aact_...` without `hmlg`)
   - Update the envs on Railway:
     ```
     ASAAS_API_KEY=<prod key>
     ASAAS_BASE_URL=https://api.asaas.com/v3
     ```

---

## 2. R2 — Pro Photos

### What it is
Cloudflare storage for item and receipt photos (a Pro feature). Without a credential: photo POST routes return 501; photos stay local only.

### Step by step

1. **Enable R2 in Cloudflare**
   - Go to the [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Go to **R2 → Buckets**
   - Create a bucket: `grosify-photos`

2. **Generate an S3 token**
   - In **R2 → Settings**
   - Click **Create API Token**
   - Permissions: `Object Read & Write`
   - Copy: Account ID, Access Key ID, Secret Access Key

3. **Environment variables** (Railway)
   ```
   R2_ACCOUNT_ID=<account ID>
   R2_BUCKET=grosify-photos
   R2_ACCESS_KEY_ID=<access key>
   R2_SECRET_ACCESS_KEY=<secret key>
   ```

4. **Test**: Upload a photo on a Pro item; the URL should be `https://<account>.r2.cloudflarestorage.com/...`

---

## 3. Turnstile — Anti-bot (Optional)

### What it is
A Cloudflare anti-bot widget on signup. Activates automatically with the Secret on the backend + Site Key on the frontend. **Requires a web rebuild.**

### Step by step

1. **Enable it in Cloudflare**
   - Dashboard → **Turnstile**
   - Create a site: `grosify-web` (or a name of your own)
   - Copy: Site Key, Secret Key

2. **Environment variables**
   - **Railway** (backend):
     ```
     TURNSTILE_SECRET=<secret key>
     ```
   - **Web build** (requires a build-time env var):
     ```
     VITE_TURNSTILE_SITE_KEY=<site key>
     ```

3. **Enable both together or disable both together**
   - If both are set: the widget is active
   - If one is missing: the widget is disabled
   - Without both: signup works without anti-bot

4. **Test**: Sign up; the widget should appear

---

## 4. Gemini — Embedding for NFC-e Matching

### What it is
Google AI for embedding item texts. It improves matching between items imported from receipts and your catalog. Without a key: matching uses fuzzy only (works, but less accurate).

### Step by step

1. **Create a key in Google AI Studio**
   - Go to [aistudio.google.com](https://aistudio.google.com)
   - Go to **API Keys**
   - Click **Create API Key**
   - Copy the key

2. **Environment variable** (Railway)
   ```
   GEMINI_API_KEY=<key>
   ```

3. **Test**: Import an NFC-e; if the key is present, matching uses embeddings; without it, it uses fuzzy

---

## 5. Infosimples — NFC-e Lookup in Sergipe

### What it is
An API to look up NFC-e (Brazilian electronic consumer receipt) records from the Sergipe portal. Cost: floor ~R$100/month. Without a credential: importing from SE returns "state not yet supported"; RS/SP/MG work for free.

### ⚠️ DECISION: Turn Sergipe on or not?

- **Yes**: Monthly cost ~R$100; any household can import from SE
- **No**: Sergipe unavailable; only RS, SP, MG work

### Step by step (if Yes)

1. **Create a trial account**
   - Go to [infosimples.com](https://infosimples.com)
   - Request a trial account (you'll receive an exact price)
   - Verify the costs fit your budget

2. **Get a token**
   - In the Infosimples panel, go to credentials
   - Copy the API token

3. **Environment variable** (Railway)
   ```
   INFOSIMPLES_TOKEN=<token>
   ```

4. **Test**: Import an NFC-e from SE; if the token works, the receipts appear

---

## 6. Validation with a Real Receipt — E2E Test

### What it is
A final manual test: scan a real NFC-e and check the end-to-end behavior.

### Step by step

1. **Get a real NFC-e**
   - Make a purchase at a supermarket in RS, SP, or MG
   - Grab the QR code (SEFAZ format)

2. **Open the app and import**
   - In the app, open **Shopping Mode**
   - Tap **Import receipt (QR)**
   - Scan the receipt's QR code

3. **Check the review screen**
   - Items should appear with name, qty, price
   - Matching should suggest items from your catalog or "new"
   - Prices should be correct (cents)
   - The CPF should **never** appear

4. **Confirm the import**
   - Choose which items to import (skip the ones you don't want)
   - Select a store (it should recognize it by CNPJ)
   - Tap **Confirm import**

5. **Validate prices**
   - Go to **Prices**
   - Look for the imported items
   - Check that `source=import` appears in the history
   - Prices should be in cents (e.g. R$12,90 = 1290)

6. **If it fails**
   - Capture the on-screen error
   - If it's a parser error: open an issue with the receipt's HTML for a fixture
   - If it's an API error: check the envs (Gemini, Infosimples)

---

## Env Summary Table

| Feature | Env Variable | When to Get It | Without It |
|---------|---|---|---|
| **Asaas** | `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL` | Create an asaas.com account | Billing 501 |
| **R2** | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare Dashboard | Photos 501 |
| **Turnstile** | `TURNSTILE_SECRET` (Railway) + `VITE_TURNSTILE_SITE_KEY` (web build) | Cloudflare Turnstile | Widget off |
| **Gemini** | `GEMINI_API_KEY` | aistudio.google.com | Fuzzy matching only |
| **Infosimples** | `INFOSIMPLES_TOKEN` | infosimples.com (trial) | SE unavailable |

---

## Suggested Implementation Order

1. **Asaas** — High priority (monetization)
2. **Gemini** — High priority (improves import UX)
3. **Infosimples** (SE) — Medium priority (cost decision)
4. **R2** — Medium priority (cosmetic Pro feature)
5. **Turnstile** — Low priority (optional, spam defense)

---

## Final Checklist

- [ ] Asaas sandbox tested (household becomes Pro)
- [ ] Asaas production configured (envs updated)
- [ ] R2 bucket created and token generated
- [ ] Gemini API key obtained
- [ ] Infosimples: decision made (Yes/No) and token (if Yes)
- [ ] Turnstile: decision made (Yes/No) and both envs set (if Yes)
- [ ] E2E test with a real receipt: ✅ items import correctly
- [ ] .env.example and apps/api/.env.example updated with placeholders
- [ ] All code in production on Railway

---

## Support

If you hit errors:
- **501 on /billing**: Asaas envs missing or invalid
- **501 on POST /photos**: R2 envs missing
- **"State not supported"**: Infosimples token missing (Sergipe)
- **Inaccurate matching**: Gemini key missing
- **Parse error**: SEFAZ portal unavailable or a new format (report it)
