# nsl/admin

Static admin console for nakreslime.cz: styles, customers, orders, analytics, system.
No build step, no runtime CDN: every dependency is stored in this folder (`vendor/`, `fonts/`).

## Security model
| Layer | What it does |
|---|---|
| Supabase Auth | email + password for an existing, confirmed account |
| TOTP MFA | mandatory; first login binds an authenticator app (QR), every login asks for the code |
| `private.admin_guard()` | every `admin_*` RPC re-checks: real user, allowlisted in `nsl_admin_members`, session `aal2`, role (`viewer` < `editor` < `owner`) |
| Audit | every write lands in `private.admin_audit` (System → Audit log) |
| Storage | `nsl_admin_read_previews` policy: only aal2 admins can sign private preview URLs (15 min) |
| Browser | strict CSP (`script-src 'self'`), `no-referrer`, login kept on the device until the end of the day (`localStorage`, stamped with the day, dropped after midnight; no idle lock), `Ctrl+L` locks at once |

The publishable key in `src/config.js` is public by design. It grants nothing without the checks above.

## Run locally
```bash
node admin/dev-server.mjs
```
Then open http://localhost:4173.

## Deploy (GitHub Pages)
Live: https://pustay-dev.github.io/nsl-admin/ (repo `Pustay-dev/nsl-admin`, Pages from `main` / root, HTTPS enforced).
Redeploy after changes:
```bash
bash admin/deploy.sh https://github.com/Pustay-dev/nsl-admin.git
```
`*.github.io` origins are already allowed by the `admin-dashboard` Edge Function, which handles session deletion.

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
`Ctrl K` palette · `g o/s/c/r/a/m/x/y` go to view · `← →` browse portraits in the big preview · `Ctrl S` save in editor · `Esc` close · `Ctrl L` lock

## Roles
- **viewer**: read everything
- **editor**: edit styles, variants, labels, finance
- **owner**: plus generation kill-switch, AI factory, example queue, members, settings, session deletion
