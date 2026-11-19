# 08 — Settings, admin and security UX audit

**Lens:** Settings hub (`/settings`, 4 tabs), User admin (`/users`), Sessions admin (`/sessions`), login (`/login`), topbar user menu.
**Reviewer stance:** SaaS admin/security UX (Workspace admin, GitHub settings, 1Password console patterns).
**Evidence:** `shots-full/page-settings--{desktop,mobile}.png`, `page-users--{desktop,mobile}.png`, `page-sessions--{desktop,mobile}.png`, `00-after-login.png`; code at `studio/app/{settings,users,sessions,login}/page.js`, `studio/components/shell/AppShell.js`, `studio/components/shell/nav.js`, `studio/app/api/{sessions,team}/route.js`, `studio/lib/site-data.js`.
**Note:** the crawler logged in before shooting, so there is no screenshot of the `/login` form itself (`00-after-login.png` is the Overview page). Login findings come from the code.

---

## 1. Plain-English summary for the owner

- **Some Settings controls don't do anything.** The three notification switches (phone pushes, failure alerts, weekly digest) flip on screen but save nothing. They reset when you reload and your phone alerts never change. Most of the "connected / failing" badges on the same page are typed into the code by hand, so they say nothing about whether a service actually works right now. A settings page that lies is worse than a missing one.
- **The tabs put things in the wrong places.** "Add a team member" is on the *General & Appearance* tab, while the *Team & Access* tab only shows a read-only list. "Sign out everywhere" and "Change password" are also on *General*, while the *Security & Sessions* tab holds a different sessions table. You have to remember which tab hides which button.
- **The security screens say you have no sessions, even while you're signed in.** When you sign in with the password (not Google), the panel doesn't record your device. So Users shows "0 sessions", Sessions shows "No sessions recorded", and "Sign out everywhere" is greyed out with no reason given, which is the moment you'd need it most.
- **The account menu always shows your name.** The avatar menu has "MH / Muzzamil Hassan / Studio owner" typed into the code. A staff member or client who signs in would see *your* name and role. The menu also has only one item (Log out).
- **Fix plan:** one Settings page with a left-side menu (Profile, Appearance, Notifications, Team, Security, Integrations, Danger zone). Each control saves for real or is removed. A role table explains in plain words what owner, staff and client can do. Every dangerous button (remove someone, sign out everywhere, revoke a device, change the password) gets the same red, clearly worded confirmation instead of the browser's plain pop-up.

---

## 2. Findings table

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| SA-1 | **P0** | Settings → General → Notifications | `page-settings--desktop.png` (3 switches, 2 on); `studio/app/settings/page.js:87` (`useState({ ntfy:true, fails:true, weekly:false })`), `:269/:276/:283` (onChange only updates local state, no fetch). Earlier audit S-3 (`research/studio-deep-audit-2026-11-18.md:148`) is still open | These are decorative switches: no API, no persistence, and they reset on reload. "Failure alerts only" looks off-able, but alerts keep firing. This is the most damaging trust problem on the page | Back the switches with a Neon `user_prefs` row (`GET/PUT /api/settings/notifications`) that `lib/ntfy-alert.mjs` reads. Until that exists, **remove the switches** and show read-only text: "Phone alerts: on (milestones + failures). Change requires a code update." Never ship a control that isn't wired |
| SA-2 | **P0** | Topbar user menu | `AppShell.js:400` `title="Muzzamil — owner"`, `:402` literal `MH`, `:409` `Muzzamil Hassan`, `:410` `Studio owner · trusted 30 days`; visible in every screenshot (top-right "MH") | Identity is hardcoded, so a staff or client user sees the owner's name and role. That's wrong on a multi-role panel and it leaks the owner's identity to clients. "Trusted 30 days" is also hardcoded and is false for a Google session that was revoked | Read `{name,email,role,authMethod,sessionExpires}` from a `/api/me` call (`getUser` already provides it). Initials come from the name, the role chip from data. Remove every literal |
| SA-3 | **P1** | Settings tabs (IA) | `settings/page.js:349-395` Team invite card, `:398-434` password card and `:437-464` sign-ins card are all inside `activeTab === 'general'`; `:468` *Team & Access* tab renders `<UsersPage/>` (read-only, `users/page.js` has no add/remove); `:469` *Security* tab renders `<SessionsAdminPage/>` | Tab labels don't match their content. Team management lives on "General & Appearance". The "Team & Access" tab can't add or remove anyone. Security actions are split across two tabs, and so are two different session lists (mine vs everyone's) | Move to the left-rail IA in §3. Team list, invite and remove go in one *Team* section. My devices, password, sign-out-everywhere and the all-users session table go in one *Security* section |
| SA-4 | **P1** | Sessions / sign-out-everywhere for password logins | `api/sessions/route.js:21-24` (qs_key owner has email `owner` → `sessions: []`), `:48` DELETE returns 401 for the same user; `settings/page.js:443` button `isDisabled={… !sessions?.length}`; `:461` copy "sign out and back in once to register this device"; `page-sessions--desktop.png` all zeros + "No sessions recorded"; `page-users--desktop.png` "Active sessions 0", "0 sessions" chip | A password sign-in never creates a session row. The owner, while signed in, is told they have zero sessions. "Sign out everywhere" is disabled with no explanation. The advice to "sign out and back in once" doesn't work for password logins, so the copy is false | Short term: show a banner on Security: "You signed in with the panel password. Password sign-ins can't be listed or revoked individually. To lock out every password device, change the panel password." Link it to the password card. Long term: issue a DB session row for password logins too, so one model covers both |
| SA-5 | **P1** | Integrations + Engine cards | `page-settings--desktop.png` right column; `studio/lib/site-data.js:119-129` (static `INTEGRATIONS` incl. "5 channels linked (4 legacy + FAJR OF QUR'AN)", Threads "Token valid until ~Oct 29", Script brain "failing"); `settings/page.js:294` unconditional `<Chip tone="ok">connected</Chip>`; `:306` "flips back to private on Oct 1" | Ten status chips and the Engine chip are hand-typed, so they never change. Facts are stale (Oct 1 and Oct 29 are long past; FAJR OF QUR'AN isn't a current channel). This breaks the owner's no-static-maps and real-channels-only directives. "Local dev localhost:3000" is shown in production | Replace with the live probe data the Warnings framework already collects. Each row shows status, *last checked* time and a "Check now" button. Remove the Engine and Typography cards from Settings (see SA-12) |
| SA-6 | **P1** | ntfy topic shown in UI | `settings/page.js:267` "Topic quarry-x7f2k-reports"; `site-data.js:129`; `app/logs/page.js:112` | An ntfy topic name works as a password: anyone who knows it can subscribe to your alerts or post fake ones. It's printed on three pages and in every screenshot shared for reviews | Mask it ("quarry-•••••-reports", plus a Reveal button for owner only and a Copy button). Rotate the topic, because it already appears in screenshots |
| SA-7 | **P1** | Dangerous-action confirmations | `settings/page.js:159` `window.confirm('Sign out EVERYWHERE?…')`, `:194` remove member `window.confirm`; `sessions/page.js:40` revoke `window.confirm`; `:112-119` red text link "Revoke"; `settings/page.js:443` sign-out-everywhere is a *secondary* grey button | Three irreversible actions use the browser's unstyled dialog (it can't be themed, shows the site URL as the title, and some mobile in-app browsers block it). Severity isn't signalled visually: the most drastic action ("Sign out everywhere") looks like the safest button on the page | Use one shared `<ConfirmDialog tone="danger">` (spec in §3.3). Destructive buttons get `color="primary-destructive"`. Put them in a "Danger zone" block at the bottom of each section |
| SA-8 | **P1** | Role clarity | `settings/page.js:352` roles explained only in a grey subtitle ("Owner = everything · staff = dashboard + run buttons · client = their own channels only (coming)"); `:383-386` role `<select>` offers bare `staff` / `client`; `page-settings--desktop.png` Team card | The only explanation of roles is one line of 11px grey text. "Client" is described as "(coming)" yet can be selected. You can't change an existing member's role (only remove and re-add). The owner role can't be granted from the UI, and the hint at `:391` says to edit "the invite file in the repo", but the API (`api/team/route.js:13,51`) accepts `owner` and Neon is the primary store, so the hint is wrong | Add a role picker with a description for each role (radio cards) plus a "What can each role do?" matrix (§3.2). Add an inline role change on each member row. Fix the hint copy. Either ship client or mark it "Preview" consistently |
| SA-9 | **P1** | Duplicate page headers inside tabs | `settings/page.js:210` `PageHeader "Settings & Workspace"` + `:468` embeds `users/page.js:28` `<h1>Users</h1>` + `:469` embeds `sessions/page.js:126` `PageHeader "Sessions"` | Two H1s stack on the Team and Security tabs (bad for screen readers, and visually two titles). The embedded pages also use two different header styles (Users is a hand-rolled 20px h1 without an icon tile; Sessions uses `PageHeader` with an icon tile, see `page-users--desktop.png` vs `page-sessions--desktop.png`) | Turn the embedded pages into section components without a page header (`<TeamSection/>`, `<SessionsSection/>`). Keep `/users` and `/sessions` as redirects to `/settings/team` and `/settings/security` |
| SA-10 | **P1** | Breadcrumb on admin pages | `page-users--desktop.png` and `page-sessions--desktop.png` breadcrumb reads "Quarry Studio / **Quarry Studio**"; `AppShell.js:280-281` looks up `NAV` (top-level only), not `ALL_NAV_ITEMS` | The user can't tell where they are. The sidebar highlights "Settings" (`AppShell.js:50-51`) but the breadcrumb doesn't say Settings | Look up `ALL_NAV_ITEMS` and render a parent crumb: "Settings / Team". On `/settings?tab=x`, show the tab label as the last crumb |
| SA-11 | **P2** | Mobile tabs clipped | `page-settings--mobile.png` tab row shows "General & Appearance", "Team & Access", then a cut-off icon; `TabNav.js` uses `overflow-x-auto no-scrollbar` | Security and Roadmap are invisible on phones, with no scroll hint or fade edge | The left-rail IA becomes a list page on mobile (§3.1). Until then, add a right-edge fade mask and scroll the active tab into view |
| SA-12 | **P2** | Typography card | `settings/page.js:246-260`; `page-settings--desktop.png` "Typography" 3 tiles | The tiles look like selectable cards but do nothing. They're a design-system note, not a setting (earlier audit S-16) | Delete. If kept, move to a `/styles` reference page |
| SA-13 | **P2** | Mobile stat tiles | `page-sessions--mobile.png` labels truncated "ACTI…", "USER…", "EXPI…"; `sessions/page.js:138` `grid-cols-3` fixed; `users/page.js:38` same, labels wrap to 3 lines in `page-users--mobile.png` | The labels can't be read on a 390px screen | `grid-cols-1 sm:grid-cols-3`, or a single compact summary line on mobile ("0 active · 0 users · 0 dead") |
| SA-14 | **P2** | Users page counters | `users/page.js:48-49` "Client channels bound" sums *all* users' channels; `page-users--desktop.png` shows **1** (YT-BOT bound to the owner, not a client) | The label promises a client metric but counts owner bindings | Count only `role === 'client'`, or rename to "Channels bound to people" |
| SA-15 | **P2** | Engineering jargon in owner-facing copy | `settings/page.js:414` "(#120)"; `:440` "this is the A1 session upgrade"; `:401` "prepared here — the value itself is changed on Vercel"; `:413` button "Verify & prepare rotation"; `:420` "token rows checked, re-protected"; `login/page.js:105` "lives in the server's environment settings"; `sessions/page.js:129` "Dead rows clean up" | Issue numbers, internal phase codes and storage words mean nothing to a plain-English owner | Rewrite (see §3.4 copy table) |
| SA-16 | **P2** | Change-password flow | `settings/page.js:398-434`; `page-settings--desktop.png` card; mobile card squeezes helper text beside the button (`page-settings--mobile.png`) | It looks like a normal "change password" form, but it doesn't change the password; the owner must finish on Vercel and redeploy. That only becomes clear after submitting. There's no strength meter, no show/hide toggle, and the 12-char rule is only in the placeholder (it disappears while typing) | Present it as a 3-step stepper from the start: "1 Check · 2 Set on Vercel · 3 Redeploy & sign in again". Put the requirement in persistent helper text, add an eye toggle and a strength bar. Add a dismissible "Waiting for redeploy" state that survives reload |
| SA-17 | **P2** | Login page | `login/page.js:91` `autoFocus` on the password field while Google is the primary CTA (`:63-75`); `:18-19` displays any `?error=` query text verbatim; `_errors-by-page.md` /login: 3× 401 in console | Focus goes to the secondary method. A crafted link like `/login?error=Your account is locked, call +1…` shows attacker text in the app's own red error style (a phishing aid; React escaping prevents XSS but not misleading text) | Map `error` codes to a fixed dictionary (`?error=not_invited` → "This Google account isn't on the team. Ask the owner to add it.") and ignore unknown codes. Drop `autoFocus` or focus the Google button. Stop the pre-auth fetches that 401 |
| SA-18 | **P2** | User menu content | `AppShell.js:404-421` (only "Log out") | No route to Profile, Security or Team from the avatar, which is where every SaaS user looks first. Log out doesn't mention that other devices stay signed in | Menu: identity header (name, email, role chip, sign-in method) → "Account & security" → "Team" (owner) → "Appearance" (Light/Dark/System segmented) → divider → "Log out of this device" |
| SA-19 | **P3** | Theme choice | `settings/page.js:225-240` only Light and Dark, but `Monitor` icon is imported (`:5`) | No "Match system" option, so the obvious third option is missing | Add a System card (next-themes supports `system`) |
| SA-20 | **P3** | "System Roadmap" as a Settings tab | `settings/page.js:20,470` | A project roadmap isn't a setting, and it adds a fourth tab that crowds mobile | Move it to Operations or a "Help & roadmap" link in the user menu |
| SA-21 | **P3** | Team avatar | `settings/page.js:363` `slice(0,2)` of name → "MU" for Muzzamil Hassan (`page-settings--desktop.png`) vs "MH" in the topbar | Initials don't match between places | Shared `initials(name)` helper: first letter of the first and last word |

---

## 3. Redesign proposals

### 3.1 Settings information architecture: left-rail, grouped

**Before:** 1 hub, 4 horizontal tabs. *General* holds appearance, notifications, engine info, integrations, safety rules, team invite, password and my sessions (the screenshot is 2,058px tall). *Team* is a read-only list. *Security* is the all-users session table. *Roadmap* is not a setting.

**After:** real sub-routes (`/settings/<section>`, deep-linkable, so the breadcrumb works), with a 220px settings rail inside the content column, like GitHub settings.

```
Quarry Studio / Settings / Security
┌──────────────────┬────────────────────────────────────────────────────┐
│ PERSONAL         │ Security                                           │
│  Profile         │ Who can get into the panel and from where.         │
│  Appearance      │                                                    │
│  Notifications   │ ┌ Your sign-in ─────────────────────────────────┐ │
│                  │ │ Signed in with Google · this device · 2h ago  │ │
│ WORKSPACE        │ └───────────────────────────────────────────────┘ │
│  Team & roles    │ ┌ Your devices ─────────────────────────────────┐ │
│  Security    ●   │ │ Chrome · Windows   this device    [Sign out]   │ │
│  Integrations    │ │ Safari · iPhone    3 days ago     [Sign out]   │ │
│  Channels ↗      │ └───────────────────────────────────────────────┘ │
│                  │ ┌ All sign-ins (owner) ─── filter: [All users ▾]┐ │
│ ADVANCED         │ │ table … Revoke                                 │ │
│  Panel password  │ └───────────────────────────────────────────────┘ │
│  Audit log       │                                                    │
│                  │ ┌ DANGER ZONE ──────────────────── red border ──┐ │
│                  │ │ Sign out everywhere                            │ │
│                  │ │ Every device, including this one, must sign    │ │
│                  │ │ in again.                [Sign out everywhere] │ │
│                  │ └───────────────────────────────────────────────┘ │
└──────────────────┴────────────────────────────────────────────────────┘
```

| Section | Contents (source today) | Who sees it |
|---|---|---|
| Profile | name, email, role chip, sign-in method, session expiry (data that `AppShell.js:409-410` hardcodes today) | everyone |
| Appearance | Light / Dark / **System** (`settings/page.js:222-244`) | everyone |
| Notifications | ntfy toggles, *persisted* (SA-1), masked topic (SA-6), "Send test push" button | owner |
| Team & roles | member list + inline role change + invite + role matrix (merged from `settings/page.js:349-395` and `users/page.js`) | owner |
| Security | my sign-in, my devices, all sign-ins table (`sessions/page.js`), danger zone | everyone (own devices) / owner (all) |
| Integrations | live probe statuses with "last checked" (replaces static `INTEGRATIONS`) | owner |
| Panel password | the 3-step rotation stepper (SA-16) | owner |
| Audit log | `appendAudit` entries already written by team/sessions routes, filterable | owner |

Removed from Settings: Typography (SA-12), Engine card (move the live URL to Profile/footer and drop the stale note), Safety rules (move to Operations → Warnings intro), Roadmap (SA-20).

**Mobile:** `/settings` becomes a grouped list (iOS Settings style, 52px rows with chevrons). Each section opens full-screen with a back arrow. This removes the clipped-tab problem (SA-11).

**Rail spec:** width 220px, `position: sticky; top: 74px`. Group labels use the existing `.overline` class. Items are 34px tall, 13px/500. Active state is `bg: var(--surface-2)` plus a 2px `var(--accent)` left bar, the same treatment as the main sidebar's active item so the two navs read as one system.

### 3.2 Team & roles: make permissions visible

```
Team & roles                                         [ + Invite member ]
3 people · 1 owner · 1 staff · 1 client

┌───────────────────────────────────────────────────────────────────────┐
│ MH  Muzzamil Hassan            Owner        Google · active now    ⋯ │
│     muzzamilhassan302@gmail.com                                       │
│ SA  Sara A.                    [Staff ▾]    Google · 2 days ago    ⋯ │
│ CL  client@brand.com           [Client ▾]   Invited · never signed in │
└───────────────────────────────────────────────────────────────────────┘

What can each role do?                                        (collapsible)
                         Owner   Staff   Client
See all channels           ✓       ✓       own only
Run pipelines / approve    ✓       ✓       —
Connect / delete channels  ✓       —       —
Manage team & sessions     ✓       —       —
Change panel password      ✓       —       —
```

- **Invite** opens a slide-over (`SlideoutDrawer.js` already exists): email field, plus role as **radio cards** each with a one-line description from the matrix. For Client, add a channel multi-select so they see something on first sign-in. The confirm button text is the specific action: "Add Sara as Staff".
- After adding, the row shows an "Invited · never signed in" status and a Copy-login-link button, because no email is sent today. Say so: "We don't email invites. Send them this link: quarry-studio.vercel.app/login".
- The row `⋯` menu holds Change role, View activity (today's `users/page.js:97` expand), Sign out their devices, and **Remove from team** (danger).
- The last owner can't be demoted or removed. Show the row's menu items disabled with the tooltip "At least one owner is required" (mirrors `api/team/route.js:67`).

### 3.3 Pattern library for dangerous actions

One `<ConfirmDialog>` component, three tiers. It replaces all `window.confirm` calls (`settings/page.js:159,194`, `sessions/page.js:40`).

| Tier | Use for | Pattern |
|---|---|---|
| **T1 Reversible** | Change role, toggle a notification | No dialog. Act immediately and show a toast with **Undo** (8s) |
| **T2 Irreversible, scoped** | Revoke one session, remove one member | Dialog: red icon. Title says verb + object ("Remove Sara from the team?"). A consequences list (bullets: "Loses access immediately", "Their 2 devices are signed out", "Their audit history is kept"). Buttons: `Cancel` (secondary, default focus) + `Remove Sara` (`primary-destructive`) |
| **T3 Irreversible, broad / self-lockout** | Sign out everywhere, change panel password, revoke *this* device | Same as T2, plus **type-to-confirm** (type `SIGN OUT`), an explicit "This includes the device you're using now" line, and post-action routing to `/login?reason=signed_out_everywhere` with a matching friendly message |

Rules:
1. **Danger zone placement.** Broad destructive actions sit in a red-bordered block at the bottom of their section (`border: 1px solid color-mix(in srgb, var(--bad) 40%, transparent)`), never in a card header next to the title (today: `settings/page.js:442-444`).
2. **Button colour carries severity.** Destructive buttons are always the destructive variant. The red text link at `sessions/page.js:112-119` becomes a `ButtonUtility` with a `Ban` icon in the row menu, opening the T2 dialog.
3. **The confirm button repeats the verb.** "Sign out 4 devices", not "OK".
4. **Show the blast radius before acting.** Fetch counts ("This signs out 4 devices for 2 people") into the dialog body.
5. **Every destructive action writes an audit entry** (already true server-side: `api/team/route.js:75`, `api/sessions/route.js:42,50`) and the success toast links to the Audit log entry.
6. **Explain disabled destructive buttons.** If a button is disabled, the tooltip says why (SA-4).

### 3.4 Copy rewrites

| Where | Before | After |
|---|---|---|
| `settings/page.js:210` | "Settings & Workspace / Appearance, team roles, active device security, integrations and roadmap." | "Settings / Your account, your team, and how the panel keeps you safe." |
| `:401` | "Verified and prepared here — the value itself is changed on Vercel, then every device signs out automatically on the next deploy." | "Changing the password takes 3 steps. We check it here, you paste it into Vercel, and after the redeploy every device must sign in again." |
| `:413` | "Verify & prepare rotation" | "Check new password" |
| `:414` | "Changing the password is safe — channel tokens live under the master key now (#120)." | "Your channel connections keep working after the change." |
| `:440` | "Revocable instantly — this is the A1 session upgrade." | "Sign out any device you don't recognise. It loses access straight away." |
| `:461` | "No active sessions found for your account yet — sign out and back in once to register this device." | (password login) "You signed in with the panel password, so devices aren't listed. Sign in with Google to see and manage each device." |
| `:391` | "Owners are added by editing the invite file in the repo." | "Members sign in with the Google account you add here. The email must match exactly. We don't send an invite email, so share the login link." |
| `sessions/page.js:129` | "…Dead rows clean up after 30 days." | "Every device signed in to the panel. Ended sign-ins disappear after 30 days." |
| `login/page.js:105` | "The password lives in the server's environment settings, never in the code." | (delete; keep only) "This device stays signed in for 30 days. On a shared computer, log out when you're done." |
| `AppShell.js:418` | "Log out" | "Log out of this device" |

---

## 4. Quick wins (each ≤ 1 day)

1. **Remove or disable the three fake notification switches** and replace them with read-only text (SA-1). About 30 minutes.
2. **Read the user menu identity from the session** (`/api/me` or reuse `getUser`): initials, name, role, sign-in method (SA-2).
3. **Move the Team invite card to the Team tab and the password and sign-ins cards to the Security tab.** These are pure JSX moves in `settings/page.js` and fix SA-3 without the full redesign.
4. **Password-login banner on Security** explaining why no devices are listed and why "Sign out everywhere" is unavailable, plus a tooltip on the disabled button (SA-4).
5. **Mask the ntfy topic** in the 3 places it appears and rotate it (SA-6).
6. **Breadcrumb fix:** look up `ALL_NAV_ITEMS` and show the parent ("Settings / Users") (SA-10).
7. **Shared `ConfirmDialog`** (T2 tier) replacing the 3 `window.confirm` calls. Make "Sign out everywhere" the destructive variant (SA-7).
8. **Responsive stat grids** `grid-cols-1 sm:grid-cols-3` on Users and Sessions (SA-13).
9. **Copy pass** from §3.4 (SA-15), and fix the "Client channels bound" count (SA-14).
10. **Login:** map `?error=` codes to a fixed dictionary and drop the password `autoFocus` (SA-17).
11. **Delete the Typography card, the stale Engine note and "localhost:3000"** (SA-5 partial, SA-12). Add a System theme option (SA-19).

## 5. Bigger bets (multi-day)

1. **Left-rail Settings with sub-routes** (§3.1): `/settings/{profile,appearance,notifications,team,security,integrations,password,audit}`. `/users`, `/sessions` and `/tasks` redirect there, and mobile gets the list-to-detail pattern. About 3 days.
2. **Real notification preferences.** A Neon `user_prefs` table, a `PUT` route, `ntfy-alert.mjs` honouring it, and a "Send test push" button. This makes the Notifications section honest. About 1.5 days.
3. **Live Integrations health.** Wire each row to the existing Warnings and scope-probe data with "last checked" times and a "Check now" button, then delete `INTEGRATIONS` from `site-data.js`. This brings the page in line with the no-static-maps directive. About 2 days.
4. **Unified session model.** Password sign-ins also create a DB session row, so the device list, "Sign out everywhere" and per-device revoke work for both sign-in methods. Removes SA-4 at the root. About 2 days, with security review.
5. **Team & roles v2** (§3.2): inline role change, role matrix, invite slide-over with a client channel picker, "invited / never signed in" state, and a per-member "sign out their devices" action. About 2–3 days.
6. **Audit log section.** A filterable viewer over the `appendAudit` stream that is already written. Every danger-zone success toast links into it. About 1.5 days.
