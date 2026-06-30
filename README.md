# Shift

A quiet time-management app: focused work shifts, an on-time streak (Cadence),
and a points-and-rewards ledger. Runs as an installable PWA on iPhone and
desktop, stores everything locally, and syncs two ways with your personal
Google Calendar.

## Run it

```bash
npm install
npm run dev        # local dev at http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the built app (use this to test install/PWA)
```

Deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages, your own).
PWA install and Google OAuth both require HTTPS in production. `localhost` is
treated as secure, so dev works without certificates.

## Install on your devices

- iPhone: open the site in Safari, Share, Add to Home Screen.
- Desktop Chrome or Edge: open the site, click the install icon in the address bar.

## Google Calendar setup (one time)

You provide your own OAuth client so the app talks to your personal account.

1. Go to Google Cloud Console and create a project (or pick one).
2. APIs and Services, Library: enable the Google Calendar API.
3. APIs and Services, OAuth consent screen: External, fill the basics, add your
   own Google account under Test users (keeps it in testing, no review needed).
4. Credentials, Create credentials, OAuth client ID, type Web application.
5. Authorized JavaScript origins: add every origin you will load the app from,
   e.g. `http://localhost:5173` and your deployed URL `https://yourdomain`.
6. Copy the client ID and paste it into `src/config.js`:
   ```js
   export const GOOGLE_CLIENT_ID = "1234....apps.googleusercontent.com";
   ```
7. Rebuild or restart dev. In the app, open Cadence and tap connect google.
   Sign in with your personal account; that account's primary calendar is used.

Scope requested: `calendar.events` (read your events, create events, patch notes).

## How sync works

- Pull (GET): Cadence, tap sync calendar to pull events from roughly two days
  back through the next week, each ready to mark on time, late, or missed.
- Push (POST): logging a Deadline or a Meet Kang with a date and time creates a
  matching event on your calendar.
- Write-back (PATCH): marking any calendar-linked event appends a short status
  note to that event's description, e.g. "[shift] Meet Kang marked: on time".

Notes:
- The no-backend OAuth token lasts about an hour. When it expires, tap connect
  again. Adding a small backend for refresh tokens is the upgrade if the
  reconnect ever annoys you.
- On an installed iOS PWA, the sign-in popup can be flaky. If it misbehaves,
  run sign-in once from the Safari tab, or switch to a redirect-based flow.

## Your data

Everything lives in this browser's localStorage under `shift-tracker-state-v1`.
Use export data and import data at the bottom of the app to back up or move
between devices, browsers, or Claude accounts. iOS can evict storage for web
apps left unused for weeks, so export occasionally.

## Layout

```
src/
  App.jsx       the whole app (Shift, Cadence, Ledger)
  calendar.js   Google Calendar OAuth + REST (GET, POST, PATCH)
  storage.js    localStorage load/save + JSON export/import
  config.js     your Google client ID goes here
  main.jsx      entry
public/         PWA icons
```

## Later: Chrome extension

The same build wraps into an MV3 extension with a small `manifest.json` and the
`dist/` output as the popup or a new tab. `chrome.identity` also makes desktop
Google auth cleaner. Ask when you want it; the app code does not need to change.

## Sharing with Kang (Supabase)

The Together tab adds a shared space: a live activity feed, emoji reactions,
comments, and Kang releasing rewards. It is dormant until you configure Supabase.

Setup (one time):

1. Create a project at supabase.com (free tier is fine).
2. SQL editor: paste and run `supabase/schema.sql`. It creates the tables,
   row-level security, helper functions, and turns on realtime.
3. Authentication, Providers: keep Email on. For magic links with no SMTP setup,
   the built-in email works for testing; add your own SMTP later for reliability.
4. Project Settings, API: copy the Project URL and the Publishable key (starts with sb_publishable_) into
   `src/config.js` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`).
5. Add your app origin under Authentication, URL Configuration (Site URL and
   redirect URLs), e.g. `http://localhost:5173` and your deployed URL.
6. Rebuild or restart. Open Together, sign in with a magic link, and tap
   create a space. Send Kang the invite code; he signs in and joins with it.

How it works:

- Completing a Shift, marking a Cadence event, and earning Ledger points each
  post to the shared feed automatically once you are in a space.
- Both of you can add emoji reactions and comments in realtime.
- When you tap redeem on a reward while in a space, it does not redeem
  immediately. It posts a request; Kang taps release; your app then marks the
  reward claimed. Outside a space, redeeming stays local as before.

Privacy: everything you post to the feed is visible to Kang. Right now Shift,
Cadence, and points all emit. If you want some categories kept private (for
example Provision), tell me and I will add a per-category share toggle so you
choose what is shared rather than all of it.

Note: the in-Claude artifact cannot reach Supabase, so sharing lives only in
this standalone app. The artifact remains your local single-user preview.
