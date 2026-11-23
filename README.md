# nsl/admin

Static admin console for nakreslime.cz: styles, customers, orders, analytics, system.
No build step, no runtime CDN: every dependency is stored in this folder (`vendor/`, `fonts/`).

## v2.0.0: simpler console (23 Nov 2026, front end only)
- Menu: **Overview** · Work (**Orders, Styles, Customers, Wall**) · Numbers (**Analytics, A/B tests**) · **System**. On phones a bottom bar (Overview, Orders, Styles, Analytics, More).
- **Overview** = today: "Needs you" (orders waiting for QC, blocked items, jobs to review, new styles to review, failures, generation off), engine card, four numbers, last 14 days, recent orders. The customisable widget board is gone.
- **Analytics** has three areas: Website (the six old tabs), Meta (ads joined to our orders, `#/analytics/meta`), Mail (delivery stats of our own outbox, `admin_mail_report`).
- **A/B tests**: Website tests plus Meta ad comparison (`#/experiments/meta`).
- Removed: Mailing page (customer mails moved to Shopify; Kviktisk is sent by hand after QC), Mail analytics/A/B, Meta campaigns, Growth, Website editor. Their RPCs and tables stay in the database until the January review.
- Look: graphite neutrals, one terracotta accent, Manrope (OFL, `fonts/manrope-*`), the QC stamp on orders. `STAGING_ONLY` is gone; staging still shows the amber banner.

## Security model
| Layer | What it does |
|---|---|
| Supabase Auth | email + password for an existing, confirmed account |
| TOTP MFA | mandatory; first login binds an authenticator app (QR), every login asks for the code |
| `private.admin_guard()` | every `admin_*` RPC re-checks: real user, allowlisted in `nsl_admin_members`, session `aal2`, role (`viewer` < `editor` < `owner`) |
| Audit | every write lands in `private.admin_audit` (System → Audit log) |
| Storage | `nsl_admin_read_previews` policy: only aal2 admins can sign private preview URLs (15 min) |
| Browser | strict CSP (`script-src 'self'`), `no-referrer`, login kept on the device indefinitely (`localStorage`, refresh token auto-renews; no daily expiry, no idle lock), `Ctrl+L` locks at once |

The publishable key in `src/config.js` is public by design. It grants nothing without the checks above.

## Run locally
```bash
node admin/dev-server.mjs
```
Then open http://localhost:4173.

## Staging and approval (v1.10.0)
- **Production** (the team sees it): admin.pustay.cz. **Staging** (only you): `bash admin/deploy.sh staging` -> https://pustay-dev.github.io/nsl-admin-staging/ (or your own domain: `STAGING_DOMAIN=admin-test.pustay.cz`, CNAME -> pustay-dev.github.io). Staging shows an amber banner and uses the same database and logins.
- **Production deploy**: no approval file. Claude (or you) runs `bash admin/deploy.sh production` when you ask for it in chat; staging first is optional (`bash admin/deploy.sh staging`).
- First time only: create the empty public repo `Pustay-dev/nsl-admin-staging`, Settings -> Pages -> main / root.

## Deploy (GitHub Pages)
Live: https://pustay-dev.github.io/nsl-admin/ (repo `Pustay-dev/nsl-admin`, Pages from `main` / root, HTTPS enforced).
Redeploy after changes:
```bash
bash admin/deploy.sh production
```
`*.github.io` origins are already allowed by the `admin-dashboard` Edge Function, which handles session deletion.

## Customer-journey analytics (v1.11.0)
Analytics has four tabs: **Overview** (production numbers; AI spend now in USD, calibrated in System from the real bill), **Customer journey** (funnel visitor → portrait → cart → checkout → paid, by device / source / landing page / campaign, home-page sections, scroll, data quality),
**Friction** (rage / dead / greyed-out clicks, errors people saw, real page speed, what people click, creator steps, portrait wait time) and **Optimise** (rule-based "fix / test next" list + test planner: visitors and days needed). A/B tests gets "Behaviour per variant" (guard-rails).
Data: theme tracker `assets/nsl-cx.js` (patch `shopify/patches/cx-analytics-v1`) → `public.cx_track` → private `cx_events` / `cx_visitors` → `admin_cx_report`, `admin_cx_ab` (migrations `*_cx_analytics_v1*.sql`). Only visitors who accepted analytics cookies; "Paid" is the real paid order via the creator session. Growth and Website tabs were removed from the menu (files stay in the repo).

## Look, speed, autosave (v1.7.0)
- **Theme:** light by default, dark follows the system or the sun/moon button (`localStorage nsl-theme`; `src/theme.js` applies it before first paint). One accent colour; green only means live/ok.
- **Autosave (`src/autosave.js`):** style and variant fields save by themselves ~1 s after you stop typing, one request at a time, chained on `updated_at` so edits never overwrite each other. A badge shows saving / saved / not saved + retry; leaving with unsaved work warns you.
- **Live prompts are held back:** the prompt text of a *live* style or variant is kept as a local draft until you press **Publish prompt**, so a half-typed sentence never reaches customers. Status changes (live / retire / hide) stay explicit with a confirm.
- **Speed:** pages show the last result instantly and refresh quietly in the background (stale-while-revalidate cache, wiped on lock). Fewer animations, no extra observers.

## Look + language (v1.9.0)
Dark by default in the store's warm palette (ink, cream, orange; light via the sun/moon button). Czech/English switch in the sidebar (`CZ/EN`, stored in `nsl-lang`): `src/i18n.js` holds the dictionary, `ui.js` translates every static text child and placeholder/title/aria-label in Czech mode; unknown strings stay English (texts built from several parts, like "started 5. 11.", are only partly translated).
Collections: open one to see its styles and move them in/out; the style editor has "+ New collection…" and "Manage". Style cover: "Use as card image on N variants" puts it on the website.

## What reaches the website (v1.8.1)
Variant **name, card image, audience, status**, style **name**, **collection** and order are public: the shop reads them from `portrait-styles` (DB function `portrait_style_catalog`; CDN cache ~1 min, +5 min stale-while-revalidate; shop refreshes on page load).
Style **cover, tagline, notes** are admin-only. Each open style/variant shows a chip ("On website" / "Reaching website…") that compares your saved values with the live public catalogue.

## Website page (v1.8.0)
Edit the frontpage hero texts (intro, 3 steps, benefits strip, button) and the 6 hero pictures. Edits **autosave as a draft in Supabase** (`public.site_content`);
**Publish** copies draft → live. The shop reads only the live copy through `site_content_public()` (anon, read-only) in `shopify/theme/assets/nsl-content.js`,
which fills text with `textContent` and accepts only images from our `style-assets` bucket. Empty field = Shopify's own text/image stays; any failure = nothing changes.
Needs ONE theme step (owner): upload `nsl-content.js` and add `<script src="{{ 'nsl-content.js' | asset_url }}" defer></script>` next to `nsl-network.js` in `layout/theme.liquid`.
Style names, covers and examples already go live from the Styles page via the `portrait-styles` function (no theme step).

## A/B tests (v1.6.0)
One live test at a time. The theme splits visitors (Theme settings → A/B test: test ID + share of B); each section has
"Zobrazit ve variantě: Vždy / Jen A / Jen B". `assets/nsl-ab.js` reports a view and links the creator session after analytics consent
(`public.ab_track`). The admin page reads portraits, carts and orders per arm from existing tables and shows a Bayesian
"chance B beats A" meter; it only calls a winner after 100+ visitors per arm, 20+ conversions and 7+ days, at 95 %.
Preview a variant without being counted: `?nsl_ab=A` / `?nsl_ab=B`.

## Local QA with fake data
`node admin/dev-server.mjs`, then open http://localhost:4173/qa/index.html (`qa/mock.js` replaces the Supabase client; not deployed).

## Keyboard
`Ctrl K` palette · `g o/r/s/c/w/a/x/y` go to view · `← →` browse portraits in the big preview · `Ctrl S` save in editor · `Esc` close · `Ctrl L` lock

## Roles
- **viewer**: read everything
- **editor**: edit styles, variants, labels, finance
- **owner**: plus generation kill-switch, AI factory, example queue, members, settings, session deletion
