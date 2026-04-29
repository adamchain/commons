# Commons V1 — Dev Summary (React + TypeScript + Node + MongoDB)

## Stack

- **Frontend:** React + TypeScript (Vite for the build — faster than CRA and zero config pain)
- **Backend:** Node + Express + TypeScript
- **Database:** MongoDB (Atlas free tier is fine for the test)
- **ODM:** Mongoose (gives you schema validation + TS types via interfaces)
- **Auth:** Magic link via email — use `nodemailer` + signed JWT tokens. No passwords.
- **Location autocomplete:** Google Places Autocomplete API (frontend widget) or Mapbox
- **Hosting:** Frontend on Vercel/Netlify, backend on Render/Railway, DB on MongoDB Atlas

## Project Structure

```
commons/
├── client/                    # React + Vite + TS
│   ├── src/
│   │   ├── api/              # fetch wrappers
│   │   ├── components/       # PlanCard, ParticipationButtons, etc.
│   │   ├── pages/            # Feed, PlanDetail, CreatePlan, Login
│   │   ├── types/            # shared TS types (mirror backend)
│   │   ├── context/          # AuthContext
│   │   └── App.tsx
│   └── package.json
└── server/                    # Node + Express + TS
    ├── src/
    │   ├── models/           # Mongoose schemas
    │   ├── routes/           # auth, plans, comments
    │   ├── middleware/       # requireAuth
    │   ├── lib/              # email, jwt
    │   └── index.ts
    └── package.json
```

## Data Model (Mongoose)

Three collections. MongoDB's document model lets you embed participants and comments directly inside the plan doc, which simplifies reads — but I'd keep them separate so you can query "all plans I'm going to" easily.

**User**
```ts
interface IUser {
  _id: ObjectId;
  email: string;          // unique, indexed
  displayName: string;
  createdAt: Date;
}
```

**Plan**
```ts
interface IPlan {
  _id: ObjectId;
  creator: ObjectId;      // ref: User
  title: string;
  location: {
    name: string;
    address: string;
    // optional: lat/lng if you use Places
  };
  date: Date;
  time: string;           // "19:30" — keep as string to allow "flexible"
  isFlexibleTime: boolean;
  tags: string[];         // subset of ['coffee','workout','social','outdoors','events'], max 3
  description?: string;
  createdAt: Date;
}
```

**Participation**
```ts
interface IParticipation {
  _id: ObjectId;
  plan: ObjectId;         // ref: Plan
  user: ObjectId;         // ref: User
  state: 'interested' | 'going';
  updatedAt: Date;
}
// Compound unique index on { plan: 1, user: 1 }
```

**Comment**
```ts
interface IComment {
  _id: ObjectId;
  plan: ObjectId;         // ref: Plan, indexed
  user: ObjectId;         // ref: User
  body: string;
  createdAt: Date;
}
```

The compound unique index on Participation is the important one — it enforces "one state per user per plan" at the database level, so you can't get duplicates from race conditions.

## API Endpoints

```
POST   /api/auth/request-link     { email }           → sends magic link
GET    /api/auth/verify?token=... → sets cookie, redirects to /
POST   /api/auth/logout

GET    /api/plans                 → feed (sorted by date asc)
POST   /api/plans                 → create
GET    /api/plans/:id             → detail + participants + comments (one call)

PUT    /api/plans/:id/participation  { state: 'interested' | 'going' }
DELETE /api/plans/:id/participation  → removes participation entirely

POST   /api/plans/:id/comments    { body }
GET    /api/plans/:id/comments    → usually included in GET /plans/:id
```

The participation PUT does an upsert — one endpoint handles "none → interested," "none → going," and "interested → going." This keeps the "no friction between states" UX rule honest at the API level.

## Auth Flow (magic link, no passwords)

1. User enters email → `POST /api/auth/request-link`
2. Server creates a short-lived JWT (15 min) with `{ email }` payload, emails a link: `https://yourapp.com/api/auth/verify?token=...`
3. User clicks → server verifies JWT, finds-or-creates User, issues a long-lived session JWT in an httpOnly cookie, redirects to `/`
4. `requireAuth` middleware reads the cookie on protected routes

`nodemailer` + any SMTP provider (Resend, Postmark, SendGrid) works. For local dev use Mailtrap or just log the link to the console.

## React Pages

1. **`/login`** — email input, "Check your email" confirmation
2. **`/`** — plan feed
3. **`/plans/new`** — create form (single screen)
4. **`/plans/:id`** — plan detail (the core screen)

Use React Router. Wrap protected routes in an `AuthContext` that fetches `GET /api/auth/me` on mount.

## Key Components

**`<PlanCard />`**
Compact card: title, time, location, tag chips, "N going" count. Clicks through to detail.

**`<PlanForm />`**
Single screen, all fields visible. Tag input that caps at 3 selections (disable remaining chips once 3 are picked). "Flexible time" checkbox that hides the time picker.

**`<ParticipationButtons />`**
Two buttons side by side. "I'm in" is primary (filled, larger, brand color). "Interested" is secondary (outline). Current state is shown by swapping the button to "You're in" / "You're interested" with a subtle checkmark. Tapping again toggles off. Optimistic update — flip the UI immediately, roll back on API error.

**`<ParticipantList />`**
Two sections: "Going" (shown first, larger avatars, names bold) and "Interested" (smaller, muted). This visual hierarchy is explicitly called out in the doc — don't flatten them into one list.

**`<CommentThread />`**
Flat list. Single textarea at the bottom. No replies, no edits, no reactions.

## Shared Types

Put types in a shared file and import them on both client and server. Simplest version: copy-paste a `types.ts` into both projects. Cleaner version: a `/shared` folder with a tiny tsconfig that both sides reference. For a 2–4 week test, copy-paste is fine.

```ts
// types.ts (shared)
export type PlanTag = 'coffee' | 'workout' | 'social' | 'outdoors' | 'events';
export type ParticipationState = 'interested' | 'going';

export interface PlanDTO {
  id: string;
  title: string;
  creator: { id: string; displayName: string };
  location: { name: string; address: string };
  date: string;           // ISO
  time: string;
  isFlexibleTime: boolean;
  tags: PlanTag[];
  description?: string;
  participants: {
    going: Array<{ id: string; displayName: string }>;
    interested: Array<{ id: string; displayName: string }>;
  };
  myState: ParticipationState | null;
}
```

## UX Rules (don't skip these — they're the experiment)

- "I'm in" must be visually dominant over "Interested"
- Going users shown more prominently than interested users
- Tap updates state immediately (optimistic UI)
- Switching Interested → I'm in must be **one tap**, no dialogs
- No confirmation modals anywhere
- Creating a plan should feel like posting, not filing a form

## What You're NOT Building

Explicitly skipped per the doc:
- User profiles beyond display name
- Direct messages
- Notifications (email or push)
- Likes, saves, bookmarks
- Any onboarding flow — land them on the feed post-login
- Feed algorithms, ranking, personalization
- Tag filtering or search

## Instrumentation

You're running an experiment, so log these events (a `logs` collection is plenty — no need for Segment/Mixpanel yet):

- `plan_created`
- `participation_changed` (with from/to states — this captures the critical Interested → Going upgrade)
- `plan_viewed`
- `comment_posted`

These map directly to the success criteria: % of plans with ≥1 action, % with ≥1 "I'm in," plans with 2+ going, repeat users.

## Build Order (roughly 1 week if you're moving fast)

1. Scaffold client (Vite + React + TS) and server (Express + TS + Mongoose), connect to Atlas
2. Magic-link auth working end to end (hardest part — do it first)
3. Mongoose models + API routes for plans
4. Feed + plan detail (read-only)
5. Create-plan form
6. Participation buttons + the two participant lists — this is the core experiment
7. Comments
8. Polish visual hierarchy of "I'm in" vs "Interested"
9. Add event logging
10. Deploy, invite the 30 users

Want me to generate the Mongoose schemas, the Express auth routes, or the `<PlanDetail />` component as actual code?