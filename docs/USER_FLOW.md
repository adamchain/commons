# COMMONS — Core User Flow Map

A map of the existing/core features, grounded in the current `commons-v2` code
(client routes in `App.tsx`, server endpoints under `server/src/routes/*`).

**Legend:** `([ ])` screen · `[ ]` action/state · `{ }` decision · dashed = optional/async.

---

## 1. Entry & Onboarding

Phone-based sign-in (Twilio Verify). Invite codes can be deep-linked
(`/?invite=CODE`) and are prefilled on the phone step.

```mermaid
flowchart TD
    A([Open Commons]) --> B{Signed in?}
    B -- No --> C["Enter phone number"]
    C --> D["Enter SMS code<br/>Twilio Verify"]
    D --> E{Admin phone?}
    E -- Yes --> F["Admin choice"]
    F --> G{Onboarding complete?}
    E -- No --> G
    B -- Yes --> G
    G -- No --> H["Pick neighborhoods<br/>geolocation-sorted"]
    H --> I["Pick interests, min 2"]
    I --> J["Profile: name + avatar"]
    J --> K["Accept community guidelines"]
    K --> L([Home / Feed])
    G -- Yes --> L
    C -. invite code link .-> C
```

`POST /api/auth/request-code` · `POST /api/auth/verify-code` ·
`POST /api/auth/redeem-code` · `GET/PATCH /api/auth/me` · `GET /api/neighborhoods`

---

## 2. Main Navigation Shell

Top bar = Notifications + Messages (with unread badge) + Profile.
Bottom nav = Home, the center **+** (new plan), Explore.

```mermaid
flowchart TD
    Home([Home / Feed])

    Home --> Notif["🔔 Notifications"]
    Home --> Msgs["💬 Messages — unread badge"]
    Home --> Prof["👤 Profile"]
    Home --> Explore["🧭 Explore"]
    Home --> New["➕ New plan"]

    Explore --> Near["Nearby places + venue search"]
    Explore --> Comm["Communities — coming soon"]
    Near --> New

    Prof --> Menu{Profile menu}
    Menu --> Network["Network"]
    Menu --> Invite["Invite friends"]
    Menu --> Settings["Settings"]
    Settings --> Theme["Appearance / theme"]
    Settings --> NPrefs["Notification prefs"]
    Settings --> Account["Sign out / delete"]

    Home --> Feedscope{Feed scope}
    Feedscope --> All["All plans"]
    Feedscope --> Mine["Mine — going/interested"]
    Home --> Filters["Filter: interest · neighborhood · day"]
```

`GET /api/plans` · `GET /api/places/nearby|search` · `GET /api/notifications` ·
`GET /api/conversations` · `GET /api/profile/:id`

---

## 3. Plan Lifecycle — the core loop

A plan is "looking-for" when any of date/time/place is left flexible;
otherwise it's a standard plan. Hosts can lock it in to confirm.

```mermaid
flowchart TD
    New["Create plan"] --> Fields["Title · venue Google place · neighborhood<br/>date/time · interests · visibility · spots · flyer"]
    Fields --> Kind{Any field flexible?}
    Kind -- Yes --> LF["Looking-for plan"]
    Kind -- No --> STD["Standard plan"]
    LF --> Feed["Shows in Feed + Explore"]
    STD --> Feed

    Feed --> Detail([Plan detail])
    Detail --> RSVP{RSVP}
    RSVP --> Going["I'm in → going"]
    RSVP --> Inter["Interested"]
    Going --> Thread["In the group chat"]
    Inter -. looking-for .-> Thread
    Detail --> Suggest["Suggest a time/idea<br/>looking-for"]
    Detail --> GetThere["Get there — maps"]
    Detail --> Share["Share"]

    Detail --> HostQ{Am I the host?}
    HostQ -- Yes --> Host["Host controls"]
    Host --> Lock["Lock it in → Confirmed"]
    Host --> Time["Propose / apply time"]
    Host --> Approve["Approve applicants<br/>capacity + approve mode"]
    Host --> InviteN["Invite from network"]
    Host --> Transfer["Transfer host"]
    Host --> Cancel["Cancel plan"]
    Host --> Edit["Edit plan"]

    Thread --> Chat([Group chat])
    Lock --> Happens([Event happens])
    Happens --> FB["Feedback: 👍/👎 + host tags"]
    Happens --> Nudge["Network nudge:<br/>add people you met"]
```

`POST /api/plans` · `GET /api/plans/:id` · `PUT/DELETE /api/plans/:id/participation` ·
`POST /api/plans/:id/lock` · `.../propose-time` · `.../apply-time` · `.../approve` ·
`.../invite` · `.../suggestions` · `.../transfer-host` · `.../cancel` · `PATCH /api/plans/:id`

---

## 4. Messaging

Per-plan group chats, plus a unified inbox of every chat you can reach
(hosting / going / interested). In-plan chat still opens from the detail page.

```mermaid
flowchart LR
    Inbox([Messages inbox]) --> Row["Row per accessible plan chat"]
    Row --> GC([Group chat])
    Detail([Plan detail]) --> GC
    GC --> Send["Send message → notifies others"]
    Inbox -. unread total .-> Badge["Top-bar badge"]
```

`GET /api/conversations` · `GET /api/plans/:planId/conversation` ·
`GET/POST /api/conversations/:id/messages`

---

## 5. Social graph

```mermaid
flowchart LR
    Me([You]) --> Net["Network — one-way adds"]
    Net --> Others["Other profiles"]
    Others --> AddF["Add to network"]
    Others --> MakeW["Make a plan with them"]
    Me --> Codes["Invite codes ×3 → SMS / share"]
    Codes --> NewU["New user onboarding"]
    Me --> NudgeAfter["Post-plan network nudge"]
    NudgeAfter --> Net
```

`GET /api/auth/network` · `POST /api/auth/friend-add|friend-remove` ·
`GET /api/auth/network-prompt` · `POST /api/auth/network-add|network-dismiss` ·
`GET /api/auth/invite-codes`

---

## Feature summary

| Area | Screen(s) | Core capability |
|---|---|---|
| Auth & onboarding | `/onboarding` | Phone sign-in, neighborhoods, interests, profile, guidelines, invite redemption |
| Feed | `/` | All vs Mine, filter by interest/neighborhood/day, just-posted pin |
| Explore | `/explore` | Nearby places by category, venue search, communities (soon) |
| Create plan | `/plans/new` | Venue picker, flexible toggles → looking-for, visibility, spots, flyer, invite |
| Plan detail | `/plans/:id` | RSVP, roster, host controls, lock-in, time proposals, get-there, share |
| Chat | `/messages`, `/plans/:id/chat` | Unified inbox + per-plan group chat with unread badge |
| Profile | `/profile/:id` | Hero, stats, interests, edit, plans calendar, menu |
| Network / Invite / Settings | `/network` `/invite` `/settings` | Network list, invite codes, theme, notification prefs, account |
| Notifications | `/notifications` | Activity feed, mark read |
| Feedback | post-plan prompt | 👍/👎 + host tags |
| Admin | `/admin` | Summary dashboard (admin phones) |
