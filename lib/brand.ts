// Single source of truth for the brand name and public web URL. Previously the
// name was hardcoded per-screen and had drifted (two spellings of the old name), and
// the web base URL was duplicated in profile/settings/user. Import from here so
// user-facing copy and share links stay consistent everywhere.
export const BRAND = 'Grabsty';

// Public web base (deep links / share URLs). The web app lives on app.grabsty.com;
// the apex grabsty.com serves the waitlist landing page.
export const APP_URL = 'https://app.grabsty.com';
