# Omskriv min tekst – launch guide

Danish AI text rewriter. Static page + one Vercel serverless function. No database, no build step, no dependencies.

```
index.html        the tool + SEO content + FAQ schema
api/rewrite.js    POST /api/rewrite → calls Anthropic or OpenAI
robots.txt, sitemap.xml
```

## Launch in ~30 minutes

### 1. Replace placeholders (5 min)
- `index.html`, `robots.txt`, `sitemap.xml`: replace `DITDOMÆNE.dk` with your domain.
- `index.html` (bottom script): set `STRIPE_PAYMENT_LINK` and `CORRECTOR_URL`.

### 2. Get an API key (5 min)
Use the same provider as your corrector.
- Anthropic: console.anthropic.com → API Keys
- or OpenAI: platform.openai.com → API keys

### 3. Deploy to Vercel (10 min)
1. Push this folder to a new GitHub repo (or run `npx vercel` in the folder).
2. Vercel → Add New → Project → import the repo → Deploy. No settings needed.
3. Project → Settings → Environment Variables:

| Name | Value | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` *or* `OPENAI_API_KEY` | your key | yes |
| `PRO_CODES` | comma-separated codes, e.g. `PRO-7Q2X,PRO-K91M` | for Pro |
| `ANTHROPIC_MODEL` / `OPENAI_MODEL` | defaults: `claude-haiku-5-5` / `gpt-4o-mini` | no |
| `FREE_WORD_LIMIT` | default 300 | no |
| `PRO_WORD_LIMIT` | default 3000 | no |
| `PER_IP_PER_HOUR` | free rewrites per IP per hour, default 20 | no |

4. Redeploy so the variables take effect.

### 4. Domain (5 min)
Buy the domain (e.g. at Simply.com, one.com or Cloudflare). Vercel → Settings → Domains → add it → copy the DNS records it shows into your registrar.

### 5. Payments (5 min)
Stripe → Payment Links → create a monthly subscription (e.g. 49 kr/md).
In the link's "After payment" settings, show a confirmation message saying the Pro code arrives by email.
When a payment comes in, email the buyer a code from `PRO_CODES`. To revoke a code, remove it from `PRO_CODES` and redeploy.

> This manual code step is fine for the first customers. Once it grows, replace it with your corrector's existing login/subscription check inside `isPro()` in `api/rewrite.js`.

### 6. SEO (5 min)
- Google Search Console → add the domain → submit `/sitemap.xml`.
- Link to the rewriter from your corrector sites (and back via `CORRECTOR_URL`).

## Notes
- The per-IP limit is in memory, so it is best-effort. If someone abuses it, add Upstash Redis (free tier) for a hard limit.
- Cost: a 300-word rewrite on a small model is a fraction of a cent.
- Swedish/Norwegian versions: copy the folder, translate the page text and the prompt in `api/rewrite.js`, deploy to a new domain.
