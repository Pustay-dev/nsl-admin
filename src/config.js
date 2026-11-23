// Public values only. The publishable key is designed to ship to browsers;
// every admin capability is enforced server-side (allowlist + MFA/aal2 + role).
export const SUPABASE_URL = 'https://nfurbsycuufhfgfnaiej.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_RB9ObHXkF_4p4Kc8VMGhhw_wg-nvzyW';
export const FUNCTIONS = SUPABASE_URL + '/functions/v1';
export const SHOP_URL = 'https://nechsenakreslit.cz';
export const VERSION = '2.0.0';

// Staging = any non-production host (test domain, github.io staging repo, localhost). Production is admin.pustay.cz and the
// pustay-dev.github.io/nsl-admin/ mirror. Staging shows an amber banner; both use the same database.
export const STAGING = !(location.hostname === 'admin.pustay.cz' || (location.hostname === 'pustay-dev.github.io' && /^\/nsl-admin(\/|$)/.test(location.pathname)));
