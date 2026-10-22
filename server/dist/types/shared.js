// Commons v2 shared types — kept in sync between client/src/types/shared.ts
// and server/src/types/shared.ts. Edit both when changing.
export const INTEREST_LABELS = {
    coffee: "Coffee",
    food: "Food",
    drinks: "Drinks",
    events: "Local",
    night_out: "Night Out",
    music: "Music",
    books: "Books",
    walks: "Walks & Outdoors",
    workouts: "Workouts",
    wellness: "Wellness",
    creative: "Creative",
    games: "Games",
    cowork: "Co-Work",
    moms: "Moms",
    new_to_philly: "New to Philly",
    sober: "Sober",
};
export const INTEREST_EMOJI = {
    coffee: "☕",
    food: "🍔",
    drinks: "🍸",
    events: "🎉",
    night_out: "🌙",
    music: "🎵",
    books: "📚",
    walks: "🌳",
    workouts: "💪",
    wellness: "🧘",
    creative: "🎨",
    games: "🎲",
    cowork: "💻",
    moms: "👩‍👧",
    new_to_philly: "🗽",
    sober: "🌱",
};
export const ALL_INTERESTS = [
    "coffee",
    "food",
    "drinks",
    "events",
    "night_out",
    "music",
    "books",
    "walks",
    "workouts",
    "wellness",
    "creative",
    "games",
    "cowork",
    "moms",
    "new_to_philly",
    "sober",
];
export const VIBE_TAGS = ALL_INTERESTS;
// NOTE: ids stay stable for data compatibility; only labels changed.
export const AGE_RANGE_LABELS = {
    "18_24": "18–24",
    "25_35": "25–34",
    "35_50": "35–49",
    "50_plus": "50+",
};
export const ALL_AGE_RANGES = ["18_24", "25_35", "35_50", "50_plus"];
export const DEFAULT_NOTIFICATION_PREFS = {
    someoneJoinedYourPlan: true,
    planTomorrow: true,
    planInTwoHours: true,
    newGroupChatMessage: true,
    postPlanNetworkNudge: true,
    planCancellation: true,
    weeklyFridayDigest: true,
    lookingForRecovery: true,
    pushEnabled: true,
};
export const COMMUNITY_CATEGORY_LABELS = INTEREST_LABELS;
export const ALL_COMMUNITY_CATEGORIES = ALL_INTERESTS;
/** Pre-unification community category slugs → nearest InterestTag. */
export const LEGACY_COMMUNITY_CATEGORY_MAP = {
    run_club: "walks",
    book_club: "books",
    fitness: "workouts",
    food_drink: "food",
    arts: "creative",
    social: "events",
    wellness: "wellness",
    other: "events",
};
/** Normalize a stored/posted category to a current InterestTag. */
export function normalizeCommunityCategory(raw) {
    if (ALL_INTERESTS.includes(raw))
        return raw;
    return LEGACY_COMMUNITY_CATEGORY_MAP[raw] ?? "events";
}
export const MAX_COMMUNITY_CATEGORIES = 3;
/** Parse up to 3 unique InterestTags from a posted/stored list. */
export function parseCommunityCategories(raw, fallback) {
    const out = [];
    const add = (value) => {
        if (typeof value !== "string" || !value)
            return;
        const tag = ALL_INTERESTS.includes(value)
            ? value
            : LEGACY_COMMUNITY_CATEGORY_MAP[value];
        if (!tag || out.includes(tag))
            return;
        out.push(tag);
    };
    if (Array.isArray(raw)) {
        for (const item of raw) {
            add(item);
            if (out.length >= MAX_COMMUNITY_CATEGORIES)
                break;
        }
    }
    if (out.length === 0 && fallback)
        add(fallback);
    return out;
}
export function communityCategoriesOf(c) {
    const parsed = parseCommunityCategories(c.categories, c.category);
    return parsed.length > 0 ? parsed : [normalizeCommunityCategory(String(c.category ?? ""))];
}
export function communityCategoryLine(c) {
    return communityCategoriesOf(c)
        .map((tag) => COMMUNITY_CATEGORY_LABELS[tag])
        .join(" • ");
}
export function toggleCommunityCategory(current, tag) {
    if (current.includes(tag))
        return current.filter((c) => c !== tag);
    if (current.length >= MAX_COMMUNITY_CATEGORIES)
        return current;
    return [...current, tag];
}
export const REPORT_REASON_OPTIONS = [
    { id: "harassment", label: "Harassment or bullying" },
    { id: "spam", label: "Spam or scam" },
    { id: "inappropriate", label: "Inappropriate content" },
    { id: "safety", label: "Safety concern" },
    { id: "other", label: "Something else" },
];
