# Commons — Product Spec

A neighborhood-scoped app for proposing loose plans and finding people to do them with. The vibe is "what's around me this week" — not Eventbrite, not Meetup. Plans can be vague ("yoga next Saturday") and people opt in.

---

## 1. Who it's for

People who want more spontaneous, low-pressure things to do near where they live. The bar to post is "I'd do this if someone joined" — not "I'm hosting an event."

---

## 2. Core principles

- **Loose by default.** A plan can be a half-formed idea. Specifics fill in as people join.
- **Neighborhood-first.** Everything is scoped to where you live. No global feed.
- **Tap, don't fill out forms.** Joining, posting, RSVPing should all feel like one tap.
- **Show, then ask.** New users see real activity before they're forced to sign up.

---

## 3. Onboarding

### 3.1 Tease before signup
Drop new users straight into a swipeable preview of a few real boards (Instagram-style). They can browse a handful of plans without an account, then get prompted to sign up to actually do anything.

### 3.2 Sign-up flow
1. **Phone number + SMS code** (Twilio). No passwords, no email.
2. **Pick your neighborhood.** Google Places autocomplete, scoped to neighborhoods/zip. This anchors everything they see going forward.
3. **Pick 3 interests.** Netflix-style tile picker — big visuals, tap to select, capped at 3.
4. **Build an avatar.** Bitmoji-style face builder instead of uploading a photo. Lower-stakes, more playful, dodges the "I don't have a good photo" friction.

### 3.3 Why this order
Phone first locks identity. Neighborhood scopes the feed. Interests power the algorithm. Avatar is the only "creative" step and goes last so people don't bail before account creation.

---

## 4. Main feed

### 4.1 Week at a glance
The default home view. Algorithm-curated based on the 3 interests, scoped to the user's neighborhood, sorted by what's coming up in the next 7 days.

### 4.2 Near me
A secondary list view: what's happening **right now** vs. **later today / this week**. Tap any row to see the plan. A persistent "+ Create" button lets people post a similar plan straight from this view.

### 4.3 Auto-suggested plans
Even with thin interest data, the app proposes generic plans the user could create — "coffee within 1 mile, Saturday morning?" — so the empty-state is never empty. Suggestions vary by radius, date, and time.

---

## 5. Views

Three toggleable views on the main feed:

- **Calendar** — month/week grid, plans show up as chips on their date
- **List** — vertical scroll of plan cards, sorted by date
- **Map** — pins on a Google Map, tap a pin and the plan slides up in a bottom sheet (does not navigate away)

The user can pin/tag plans they're considering — these get a separate "Saved" filter across all three views.

---

## 6. Posting a plan

### 6.1 Flexibility is the point
Plans don't need a locked time, address, or attendee count. "Yoga next Saturday" is a valid plan. Specifics get filled in by the host or surface in the chat as people join.

### 6.2 Create flow
- **Title** — free text
- **Location** — address dropdown (Google Places autocomplete) OR a generic neighborhood tag
- **Date** — required, but can be a range
- **Time** — optional; "flexible" is a first-class option
- **Radius** (for auto-suggest mode) — how far the host is willing to travel
- **Tags** — pick from the same interest list, max 3

The form is one screen, all fields visible, no wizard. Posting feels like making a social post, not filing paperwork.

### 6.3 UI reference
Pull visual inspiration from the **Phoenix sober** app — clean, modern, mobile-native, not corporate.

---

## 7. Plan detail page

### 7.1 Header
- Title
- **"Hosted by [emoji] [first name]"** — no last name, no full profile blast. Tap the name to open the host's profile.
- Date, time (or "flexible"), location

### 7.2 Participants
Two sections, visually distinct:
- **Going** — bigger avatars, bolder names, listed first
- **Interested** — smaller, muted, below

Tap any name → that user's profile.

### 7.3 Actions
- **"I'm in"** (primary, filled, brand color) — dominant button
- **"Interested"** (outline, secondary)
- **Share** — opens a sheet to invite specific people (see §9)
- **Get there** — deep-links to Uber / Lyft with the destination pre-filled

### 7.4 Profile (when tapping a name)
Avatar, first name, neighborhood, interests, plans they've hosted or joined recently. No DM button from a cold profile — DMs are scoped to events (see §8).

---

## 8. Messaging

Modeled after Zoom's group + DM split:
- **Event group chat** — every plan has its own thread, opens from the plan detail page
- **In-event DMs** — inside the group chat you can message individual participants privately (like Zoom side-PMs)

You can't DM someone you haven't shared a plan with. This keeps the surface area for unwanted messages near zero.

---

## 9. Sharing & invites

### 9.1 Share an event
After joining a plan, a "Share" button appears. Two paths:
- **In-app** — search your friends, tap to send
- **SMS fallback** — if the person isn't on Commons, share via SMS with a deep link

### 9.2 SMS invites for non-users
The link previews the plan and prompts signup. After signup, they land directly on the plan they were invited to (deferred deep-link).

---

## 10. After the event

A feedback prompt fires shortly after the plan's end time. Lightweight — a thumbs up/down, optional one-line note, optional tag for the host. Feeds back into the recommendation algo and surfaces good hosts.

---

## 11. Infrastructure

| Need | Choice |
|---|---|
| Phone auth + SMS invites | Twilio |
| Maps + autocomplete | Google Maps + Places API |
| Avatar builder | Bitmoji-style SDK (Bitmoji Kit, or open-source equivalent like DiceBear / ReadyPlayerMe-lite) |
| Rideshare deep links | Uber Universal Link, Lyft Deeplink |
| Push notifications | (TBD — likely Expo or APNs/FCM direct depending on native vs. web wrapper) |

---

## 12. What's explicitly **out** of v1

- Public/global feed beyond the user's neighborhood
- Cross-neighborhood discovery
- Following users
- Likes / reactions / bookmarks beyond "saved"
- Photo upload (avatar builder replaces it)
- Email at all (phone-only)
- Paid / ticketed events
- Recurring plans

---

## 13. Decisions (formerly open questions)

1. **Neighborhood = a named area, not a radius.** Use a curated list of neighborhoods per metro (e.g., for Phoenix: "Arcadia," "Roosevelt Row," "Tempe," etc.). Users see plans posted *in* their neighborhood + plans posted in adjacent neighborhoods (graph-based, defined per metro). Self-selected radius is too fiddly and creates lopsided experiences (people in dense areas see chaos, people on the edge see nothing).
2. **Yes, the algorithm penalizes declines — softly.** A "not interested" tap drops similar plans (same host, same tag combo) by ~30% in ranking for 7 days, then decays. Hard-blocks are reserved for "hide host" — explicit, manual.
3. **SMS invites are rate-limited.** 10 per user per day, 50 per week. New accounts get 3/day for the first week. If a user is reported by 3+ recipients, invites are suspended pending review. Twilio's deliverability cost makes abuse expensive on our side too — this is both a safety measure and a cost guard.
4. **One avatar per user, but expressions are swappable.** The base face is set at signup. Users pick from a library of expressions/poses per plan ("hyped," "chill," "low energy") — same character, different vibe. Cheaper to build than full multi-mode and reads better socially.
5. **Avatar provider: DiceBear, not Bitmoji Kit.** Bitmoji Kit's TOS restricts non-Snap apps and the integration is heavy. DiceBear's open-source "Avataaars" or "Big Smile" collections are free, customizable, render as SVG (cheap), and we own the result. Trade-off: less personalization than Bitmoji. Acceptable.

---

## 14. Build order (suggested)

1. Phone auth (Twilio) — hardest piece, do first
2. Neighborhood + interests onboarding
3. Avatar builder (DiceBear)
4. Plan model + create flow
5. List view of plans, scoped to neighborhood
6. Map view + bottom sheet
7. Calendar view
8. Plan detail + participation buttons
9. Group chat + in-event DMs
10. Share / SMS invites
11. Auto-suggestions + week-at-a-glance algorithm
12. Post-event feedback loop
13. Tease / pre-signup preview

---

## 15. Recommendation algorithm — "Week at a glance"

The feed is not chronological. It's a ranked list of plans happening in the next 7 days inside the user's neighborhood graph. The score for each plan, for each user, is:

```
score = (interest_match × 3.0)
      + (proximity_bonus × 1.5)
      + (social_proof × 1.2)
      + (host_quality × 1.0)
      + (recency_boost × 0.8)
      - (decline_penalty × 2.0)
      - (saturation_penalty × 1.0)
```

| Signal | What it is | How it's computed |
|---|---|---|
| `interest_match` | 0–1 | Jaccard similarity between user's 3 interests and plan's tags |
| `proximity_bonus` | 0–1 | 1.0 if same neighborhood, 0.5 if adjacent, 0 otherwise |
| `social_proof` | 0–1 | log-scaled count of "going" users, capped at 1.0 around ~10 going |
| `host_quality` | 0–1 | rolling 30-day avg of post-event thumbs-up for this host |
| `recency_boost` | 0–1 | newer posts boosted, decays linearly over 48 hours |
| `decline_penalty` | 0–1 | 0.3 if user declined a similar plan in the last 7 days, decays |
| `saturation_penalty` | 0–1 | 0.5 if same host's plan already in user's top 3 — prevents single-host takeover |

**Cold start:** new users with no decline history and one of three interests still see plans — `interest_match` alone is enough to seed a usable feed. Empty-state fallback: auto-suggested generic plans (§4.3).

**Why this shape:** the multipliers prioritize "something I'd like" over "something popular." Social proof is real but capped — we don't want a runaway-winner effect where the same 3 plans dominate everyone's feed. `saturation_penalty` enforces variety per host.

**Recompute cadence:** on plan view (cheap, in-memory), and a nightly batch job that pre-computes top-N for active users to keep the home screen instant.

---

## 16. Chat data model

Three collections, modeled after Zoom's group + side-DM split:

**`Conversation`**
```ts
interface IConversation {
  _id: ObjectId;
  plan: ObjectId;             // every plan has exactly one group conversation
  type: 'group' | 'dm';       // group = plan-wide; dm = 1:1 inside a plan
  participants: ObjectId[];   // for dm, exactly 2 user ids; for group, mirrors plan participants
  createdAt: Date;
  lastMessageAt: Date;        // for sorting the inbox
}
// Index: { plan: 1, type: 1, participants: 1 } — supports "find DM between A and B in plan X"
```

**`Message`**
```ts
interface IMessage {
  _id: ObjectId;
  conversation: ObjectId;     // ref Conversation, indexed
  sender: ObjectId;           // ref User
  body: string;               // text only in v1
  createdAt: Date;
  readBy: ObjectId[];         // user ids who've read; client computes unread
}
```

**`MessageReaction`** (optional, ship if time)
```ts
interface IMessageReaction {
  _id: ObjectId;
  message: ObjectId;
  user: ObjectId;
  emoji: string;              // single unicode emoji
}
// Compound unique: { message, user, emoji }
```

**Rules:**
- A DM conversation is **created lazily** the first time user A taps "Message" on user B inside a plan. Don't pre-create DMs.
- DMs are **scoped to the plan** — when the plan ends + 30 days, the DM is archived (read-only). Prevents Commons becoming a general-purpose messenger.
- Leaving a plan removes you from the group conversation but does not delete your past messages (rendered as "former participant").
- Real-time: WebSocket (Socket.io) for v1. Push notifications via APNs/FCM for messages received while app is closed.

**Why scope DMs to plans:** the whole point of the app is "people you'd actually do a thing with." A user's inbox should never have a DM from a stranger they've never shared a plan with. This is a feature, not a limitation.

---

## 17. Plan-detail page — wireframe

```
┌──────────────────────────────────────────┐
│  ←                                  ⋯    │  ← back / overflow (report, hide host)
├──────────────────────────────────────────┤
│                                          │
│   🧘  Yoga in Encanto Park               │  ← title + emoji
│                                          │
│   Sat, May 4 · ~9am (flexible)           │  ← date · time, italic if flex
│   Encanto Park · Phoenix                 │  ← location, tap → map
│                                          │
│   ┌────┐                                 │
│   │ 😎 │  Hosted by Jamie                │  ← avatar + first name only
│   └────┘                                 │     tap → host profile
│                                          │
├──────────────────────────────────────────┤
│                                          │
│   ┌─────────────┐  ┌──────────────┐      │
│   │   I'm in    │  │  Interested  │      │  ← primary + secondary CTA
│   └─────────────┘  └──────────────┘      │
│                                          │
│   [ 🚗 Get there ]   [ ↗ Share ]         │  ← Uber/Lyft + invite sheet
│                                          │
├──────────────────────────────────────────┤
│                                          │
│   GOING (4)                              │  ← bigger, bolder
│   ┌──┐  ┌──┐  ┌──┐  ┌──┐                 │
│   │😎│  │🤙│  │😊│  │😴│                 │
│   └──┘  └──┘  └──┘  └──┘                 │
│   Jamie Sam  Alex  You                   │
│                                          │
│   Interested (7)                         │  ← smaller, muted
│   • Riley • Pat • Sky • Dee • +3         │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│   💬  Group chat (12)        →           │  ← opens conversation
│                                          │
└──────────────────────────────────────────┘
```

**Interaction notes:**
- Tap "I'm in" → button morphs to "You're in ✓", optimistic, no modal
- Tap a "Going" avatar → that user's profile (with "Message" button visible because you share this plan)
- Tap location → opens map view centered on the plan with bottom sheet pre-expanded
- Tap "Get there" → opens action sheet with Uber / Lyft / Apple Maps / Google Maps options
- Tap "Share" → bottom sheet with friend search at top, "Invite via SMS" at bottom

---

## 18. Onboarding wireframe — five screens

```
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│            │   │            │   │            │   │            │   │            │
│  COMMONS   │   │  +1        │   │  Where do  │   │  What do   │   │  Make your │
│            │   │  ___-____  │   │  you live? │   │  you like? │   │  face      │
│  [ swipe   │   │            │   │            │   │  pick 3    │   │            │
│   through  │   │ [ Send     │   │ [ search   │   │            │   │ [ avatar   │
│   sample   │   │   code ]   │   │   places ] │   │ ┌──┐ ┌──┐  │   │   builder] │
│   plans ]  │   │            │   │            │   │ │🧘│ │☕│  │   │            │
│            │   │   ↓        │   │ Arcadia    │   │ └──┘ └──┘  │   │  hair ▾    │
│   →→→      │   │  __ __ __  │   │ Roosevelt  │   │ ┌──┐ ┌──┐  │   │  eyes ▾    │
│            │   │  __ __ __  │   │ Tempe      │   │ │🏃│ │🍻│  │   │  skin ▾    │
│  [ Sign up │   │            │   │ Downtown   │   │ └──┘ └──┘  │   │            │
│    to do   │   │ [ Verify ] │   │            │   │            │   │ [ Done ]   │
│    more ]  │   │            │   │ [ Next ]   │   │ [ Next ]   │   │            │
│            │   │            │   │            │   │            │   │            │
└────────────┘   └────────────┘   └────────────┘   └────────────┘   └────────────┘
   tease           phone +          neighborhood     interests        avatar
                   SMS code         picker           (Netflix-tile)   (DiceBear)
```

- **Tease screen** is fully interactive — users can browse 5–10 sample plans before being asked to sign up. The "Sign up to do more" CTA is sticky at the bottom.
- **Phone screen** auto-advances to the code screen after submit; SMS prefill works on iOS/Android natively.
- **Neighborhood picker** uses Google Places autocomplete restricted to neighborhoods in metros we've launched.
- **Interest picker** disables remaining tiles once 3 are selected — visual cue, no error message.
- **Avatar builder** uses DiceBear's customizer — hair, eyes, skin, accessories. ~5 dropdowns max. Save renders SVG and stores the seed string.

---

## 19. Notes for the existing scaffold

The current `/client` and `/server` codebase implements the **earlier** Commons spec (magic-link auth, simple plan CRUD, no map/chat/avatar). This new spec is a substantial rebuild — phone auth replaces magic links, MongoDB models gain neighborhood/avatar/chat collections, and the UI grows three new views (map, calendar, onboarding).

Recommended approach: branch from `main`, build the new flows incrementally per §14, and keep the v1 scaffold deployable until the new pieces have parity. Don't try to morph the existing pages in place — the IA is different enough that it'll be slower than a clean rewrite of the affected files.

---

## 20. Post-event feedback

### 20.1 When it fires
A push notification 90 minutes after the plan's scheduled end time (or 90 minutes after start time + 2h if the plan has no defined end). Only fires for users marked `going` — `interested` users get nothing.

### 20.2 The prompt
A single-screen modal, three taps max:

```
┌──────────────────────────────────────────┐
│                                          │
│   How was Yoga in Encanto Park?          │
│                                          │
│   ┌────┐    ┌────┐                       │
│   │ 👍 │    │ 👎 │                       │
│   └────┘    └────┘                       │
│                                          │
│   ──── (after thumb tap) ────            │
│                                          │
│   Anything to call out? (optional)       │
│   ┌────────────────────────────────┐     │
│   │                                │     │
│   └────────────────────────────────┘     │
│                                          │
│   Tag the host? (optional)               │
│   [ ⭐ great host ]  [ 🔄 would do again ]│
│   [ 🤝 made me feel welcome ]            │
│                                          │
│   [ Done ]   [ Skip ]                    │
│                                          │
└──────────────────────────────────────────┘
```

### 20.3 What feeds back into the system
- 👍 / 👎 → `host_quality` signal (§15) for the host's next 30 days of plans
- Free-text → stored, not surfaced anywhere automatically; available to moderation review if a report is filed
- Host tags → counted on the host's profile (§21) as small badges next to their name (e.g., "⭐ ×7")

### 20.4 Why it's lightweight
The bar is "did you have a good time" — not a full review. We're not building Yelp. The only required action is one tap, and the modal can be dismissed with no penalty.

---

## 21. Host profile

### 21.1 What's shown
```
┌──────────────────────────────────────────┐
│   ←                              ⋯       │
├──────────────────────────────────────────┤
│                                          │
│        ┌────────┐                        │
│        │  😎    │   Jamie                │  ← avatar + first name
│        └────────┘   Arcadia · 📍         │  ← neighborhood
│                                          │
│   ⭐ ×12   🔄 ×8   🤝 ×5                 │  ← top 3 host tags from feedback
│                                          │
│   ┌─────────────────────────┐            │
│   │  Message in current plan│            │  ← only visible if shared plan
│   └─────────────────────────┘            │
│                                          │
├──────────────────────────────────────────┤
│   HOSTING SOON                           │
│   • Yoga in Encanto Park · Sat 9am       │
│   • Coffee at Lux · Tue 8am              │
│                                          │
│   PAST PLANS                             │
│   • Run group · Apr 12 · 6 went          │
│   • Trivia night · Apr 5 · 11 went       │
│                                          │
└──────────────────────────────────────────┘
```

### 21.2 Rules
- **No last name, no bio, no photo.** Avatar + first name + neighborhood, that's it. Keeps the surface area small and the vibe friendly.
- **"Message" only appears if you share a current plan.** This is the hard rule from §8 — you can't cold-DM anyone. A profile is browseable, but contact requires a shared plan.
- **Past plans are public** — anyone can see what someone has hosted. Counts go a long way for trust. We do *not* show plans they merely attended.
- **Block / report** lives in the `⋯` overflow. Block hides their plans from your feed and prevents future DMs. Report goes to moderation queue.

---

## 22. Push notifications

### 22.1 Taxonomy

| Notification | Trigger | Default |
|---|---|---|
| `plan.invite` | Someone shared a plan with you in-app | On |
| `plan.someone_joined` | A user joined a plan you're hosting | On |
| `plan.tomorrow` | Plan you're going to is tomorrow at 6pm | On |
| `plan.starting_soon` | Plan starts in 1 hour | On |
| `plan.feedback` | 90 min after plan ends (§20) | On |
| `chat.group_message` | New message in a plan group chat | Batched (§22.2) |
| `chat.dm` | New DM in any plan-scoped conversation | On |
| `algo.weekly_digest` | Sunday 6pm — top 3 plans this week | On |
| `host.thanks` | Someone gave you 👍 in feedback | Off |

### 22.2 Batching
- `chat.group_message` is **batched at 1-minute windows per conversation** ("Jamie + 3 others sent messages"). Active chats would otherwise spam.
- `chat.dm` is **never batched** — they're rare and personal.
- All notifications have a quiet-hours window (10pm–7am local) — only `chat.dm` from someone you're actively in conversation with breaks through.

### 22.3 Settings
A single screen, organized by category (Plans / Chat / Algo). Each row has an on/off toggle. No granular controls beyond that — ten checkboxes is the max anyone tolerates.

### 22.4 Channels
- Mobile: APNs (iOS) / FCM (Android) via Expo or direct
- In-app: a bell icon with a count, opens an inbox of the same notifications

### 22.5 Deep links
Every notification has a deep link straight to the relevant screen:
- `plan.*` → plan detail page
- `chat.*` → conversation
- `algo.weekly_digest` → home feed with the digest filter applied

---

## 23. Moderation & safety

### 23.1 Reporting
Three places to report:
- A plan (`⋯` on plan detail) — categories: spam, unsafe, inappropriate, other
- A user (`⋯` on profile) — same categories
- A message (long-press in chat) — same categories

All reports go to a single moderation queue, reviewed by humans for the first 6 months. Auto-actions only kick in for clear signals (3+ reports on the same content within 24h → auto-hide pending review).

### 23.2 Blocking
- Blocking a user removes them from your feed, hides your plans from them, prevents DMs in either direction.
- Mutual block is the same as unmutual block from each side — symmetric.
- Block is silent — the blocked user is never notified.

### 23.3 SMS abuse guard
Per §13 #3: 10 invites/day, 50/week, new accounts capped at 3/day for week one. Recipients can reply STOP (Twilio handles); 3 reports → suspension pending review.

### 23.4 Plan content
- No paid plans. Any plan that mentions price, ticket, sales → flagged automatically, hidden until reviewed.
- No external recruitment. MLM, religious recruitment, political organizing → in T&Cs as removable, judged case-by-case.

### 23.5 Account takedown
If a user is removed:
- Their plans are deleted (not just hidden — participants get notified the plan was canceled)
- Their messages remain but are rendered as "former member"
- Their feedback signals are wiped from host_quality scores

---

## 24. Metro launch plan

### 24.1 Launch order
1. **Phoenix** (private beta, ~30 users) — founding metro, best testbed
2. **Tucson** (90 days post-launch) — same state, validates expansion model
3. **Austin** or **Denver** — pick based on which has stronger waitlist signal

### 24.2 Per-metro setup
For each new metro, we need:
- A **neighborhood graph** — list of named neighborhoods + adjacency (which border which). One-time data entry per metro, ~30–80 nodes typical.
- **Seed plans** for the first 2 weeks so the feed is never empty (run by a community lead — could be us, could be a paid local).
- A **community lead** — one person with admin rights for moderation queue and seed plan posting.

### 24.3 Why slow expansion
The whole product is "people near you doing things." A half-empty metro feels worse than no metro at all. We'd rather have one dense city than five anemic ones. Gate launch on hitting density (e.g., ≥ 5 plans/week per neighborhood) before opening signup geographically.

### 24.4 Density signal
Track `plans_per_neighborhood_per_week` as the north-star health metric. When it dips below 2 in any active neighborhood for 3 consecutive weeks, the community lead gets pinged to seed.

---

## 25. Build order — revised

The original §14 list is still right, but with the new spec sections we have more clarity on dependencies. Revised:

**Phase 1: Foundation (~1 week)**
1. Twilio phone auth (replace magic-link entirely)
2. Mongo schemas: `User`, `Neighborhood`, `Interest`, `Avatar`
3. Onboarding flow (5 screens — phone / code / neighborhood / interests / avatar)
4. DiceBear avatar integration

**Phase 2: Plans (~1 week)**
5. `Plan` schema with neighborhood + flexibility fields
6. Create-plan flow (one screen, all fields)
7. List view of plans, scoped to user's neighborhood graph
8. Plan detail page with participation buttons
9. "Near me" / "happening now" view

**Phase 3: Discovery (~1 week)**
10. Map view + bottom sheet (Google Maps)
11. Calendar view
12. Auto-suggested plans (cold-start fallback)
13. "Week at a glance" algorithmic feed (§15)
14. Tease / pre-signup preview

**Phase 4: Social (~1 week)**
15. `Conversation` + `Message` schemas (§16)
16. Group chat per plan
17. In-event DMs
18. Share sheet (in-app friend search + SMS fallback)
19. WebSocket real-time + push notifications (§22)

**Phase 5: Quality loops (~3 days)**
20. Post-event feedback prompt (§20)
21. Host profile page (§21)
22. Reporting + blocking (§23)
23. Host quality signal feeding back into the algo

**Phase 6: Launch prep (~3 days)**
24. Phoenix neighborhood graph data entry
25. Seed plan tooling for community leads
26. Moderation dashboard (basic: queue + approve/reject)
27. Density metric dashboard

Estimate: ~4 weeks of focused work for one full-stack engineer to ship a launchable Phoenix beta.

---

## 26. What's still genuinely undecided

- **Native vs. PWA.** Push notifications, deep links, SMS prefill all work better native. But a Vite + React PWA is faster to ship and gets us testing sooner. Lean PWA for v1, plan a React Native rewrite if the experiment validates.
- **Real-time stack.** Socket.io is easy but heavy. Server-Sent Events would cover the chat use case at lower cost. Punt until chat is being built.
- **Where DiceBear renders.** Client-side SVG is simpler, but rendering on the server (and caching as PNG) gives us a stable URL that works in SMS previews. Probably worth doing both.
- **What "adjacent neighborhood" means in practice.** Hand-curated graph or computed from polygon centroids? Hand-curated is more accurate, computed scales. Start hand-curated for Phoenix.
