// Public values only. The publishable key is designed to ship to browsers;
// every admin capability is enforced server-side (allowlist + MFA/aal2 + role).
export const SUPABASE_URL = 'https://nfurbsycuufhfgfnaiej.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_RB9ObHXkF_4p4Kc8VMGhhw_wg-nvzyW';
export const FUNCTIONS = SUPABASE_URL + '/functions/v1';
export const SHOP_URL = 'https://nechsenakreslit.cz';
export const VERSION = '1.18.0';

// Staging = any non-production host (test domain, github.io staging repo, localhost). Production is admin.pustay.cz and the
// pustay-dev.github.io/nsl-admin/ mirror. Views listed here are built but not fully usable yet, so the team does not see them
// on the live admin; they stay visible on staging for testing. Remove an id from this list to release the view.
export const STAGING = !(location.hostname === 'admin.pustay.cz' || (location.hostname === 'pustay-dev.github.io' && /^\/nsl-admin(\/|$)/.test(location.pathname)));
export const STAGING_ONLY = ['meta', 'meta-analytics', 'meta-ab', 'mail-analytics', 'mail-ab']; // built but not ready: hidden on production, visible on staging
