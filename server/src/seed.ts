import { store } from "./store.js";
import type { InterestTag } from "./types/shared.js";
import { createUser, findUserByPhone, updateUser } from "./userRepo.js";

interface SeedUser {
  phoneNumber: string;
  firstName: string;
  neighborhoodKey: string;
  interests: InterestTag[];
  avatarSeed: string;
}

interface SeedPlan {
  creatorPhone: string;
  title: string;
  neighborhoodKey: string;
  location: { name: string; address: string; lat?: number; lng?: number };
  daysFromNow: number;
  time: string;
  isFlexibleTime: boolean;
  endHoursAfterStart?: number;
  tags: InterestTag[];
  description?: string;
  hostEmoji: string;
  going: string[];
  interested: string[];
  messages: Array<{ senderPhone: string; body: string; minutesAgo: number }>;
  planKind?: "standard" | "looking_for";
}

interface SeedNeighborhood {
  /** Stable UUID — pinned so re-running the seed doesn't orphan existing user.neighborhoodIds. */
  id: string;
  key: string;
  name: string;
  metro: string;
  adjacentKeys: string[];
  lat: number;
  lng: number;
}

/**
 * COMMONS-seeded Philly neighborhoods. IDs are hard-pinned. Adjacent graph is
 * approximate for proximity ranking.
 *
 * Do NOT regenerate these UUIDs — they are referenced by existing users'
 * `neighborhoodIds` arrays in prod Mongo. If you must add or rename one, give
 * it a freshly-generated UUID; never change one in-place.
 */
const PHILLY_NEIGHBORHOODS: SeedNeighborhood[] = [
  { id: "da9fed31-c42f-4f09-852b-d08eca81ea4a", key: "center_city", name: "Center City", metro: "Philadelphia", adjacentKeys: ["rittenhouse", "old_city", "graduate_hospital", "chinatown", "society_hill"], lat: 39.9526, lng: -75.1652 },
  { id: "6b6941f6-a1d3-4d23-85ba-3d61d6e9a869", key: "rittenhouse", name: "Rittenhouse", metro: "Philadelphia", adjacentKeys: ["center_city", "fairmount", "graduate_hospital"], lat: 39.949, lng: -75.171 },
  { id: "d6e534cd-92ca-43ce-b959-68ea0be77f24", key: "old_city", name: "Old City", metro: "Philadelphia", adjacentKeys: ["center_city", "northern_liberties", "society_hill", "chinatown"], lat: 39.9522, lng: -75.1438 },
  { id: "f79f919c-ce4b-43a6-9541-904559023f9f", key: "northern_liberties", name: "Northern Liberties", metro: "Philadelphia", adjacentKeys: ["old_city", "fishtown"], lat: 39.9625, lng: -75.139 },
  { id: "4b108a5e-929e-4cf6-ba60-9faef931cb56", key: "fishtown", name: "Fishtown", metro: "Philadelphia", adjacentKeys: ["northern_liberties", "kensington", "port_richmond"], lat: 39.9707, lng: -75.1297 },
  { id: "6c96284f-52b7-4ff3-8345-966350592071", key: "south_philly", name: "South Philly", metro: "Philadelphia", adjacentKeys: ["center_city", "queen_village", "bella_vista", "passyunk_square", "point_breeze"], lat: 39.9279, lng: -75.159 },
  { id: "dde7755e-0981-41fd-9d92-27d9a4313797", key: "west_philly", name: "West Philly", metro: "Philadelphia", adjacentKeys: ["center_city", "fairmount", "university_city", "brewerytown"], lat: 39.9526, lng: -75.2125 },
  { id: "00c322de-3499-4f91-98a5-2cb567f1d5e1", key: "manayunk", name: "Manayunk", metro: "Philadelphia", adjacentKeys: ["fairmount", "roxborough", "east_falls"], lat: 40.0253, lng: -75.2214 },
  { id: "816c1ec3-a349-47d4-88b2-2dfb9d131967", key: "fairmount", name: "Fairmount", metro: "Philadelphia", adjacentKeys: ["rittenhouse", "center_city", "manayunk", "brewerytown", "east_falls"], lat: 39.9673, lng: -75.179 },
  { id: "070c4c34-0616-400e-9614-0bcab62b3f94", key: "graduate_hospital", name: "Graduate Hospital", metro: "Philadelphia", adjacentKeys: ["rittenhouse", "center_city", "point_breeze", "university_city"], lat: 39.942, lng: -75.175 },
  { id: "5dc1ed63-0c7f-437b-9e41-fb16229527b0", key: "kensington", name: "Kensington", metro: "Philadelphia", adjacentKeys: ["fishtown", "port_richmond"], lat: 39.9812, lng: -75.128 },
  { id: "b57bf51e-8ceb-4f25-ba69-69c69bbabe3c", key: "port_richmond", name: "Port Richmond", metro: "Philadelphia", adjacentKeys: ["kensington", "fishtown"], lat: 39.9853, lng: -75.1074 },
  { id: "2eac857d-850b-4f91-b99f-2f6515aca348", key: "queen_village", name: "Queen Village", metro: "Philadelphia", adjacentKeys: ["old_city", "south_philly", "society_hill", "bella_vista"], lat: 39.937, lng: -75.1477 },
  { id: "95a03008-1f69-4f7f-83b5-937263ac8146", key: "bella_vista", name: "Bella Vista", metro: "Philadelphia", adjacentKeys: ["south_philly", "queen_village", "passyunk_square"], lat: 39.9377, lng: -75.1585 },
  { id: "00e4e298-08e2-4fe7-83a1-e4a5f2f73705", key: "passyunk_square", name: "Passyunk Square", metro: "Philadelphia", adjacentKeys: ["south_philly", "bella_vista", "point_breeze"], lat: 39.928, lng: -75.165 },
  { id: "c95e5226-0669-4c1c-b3c2-b9720ada1334", key: "point_breeze", name: "Point Breeze", metro: "Philadelphia", adjacentKeys: ["south_philly", "passyunk_square", "graduate_hospital"], lat: 39.928, lng: -75.178 },
  { id: "aa04a06d-3238-472c-af57-97a39d9dfe39", key: "university_city", name: "University City", metro: "Philadelphia", adjacentKeys: ["west_philly", "graduate_hospital"], lat: 39.9522, lng: -75.1932 },
  { id: "e9cf5374-7c20-4664-bee6-ee2a3682a17e", key: "east_falls", name: "East Falls", metro: "Philadelphia", adjacentKeys: ["manayunk", "fairmount", "roxborough"], lat: 40.009, lng: -75.188 },
  { id: "c7369aef-a05c-45e7-b69d-15c5cee0a88e", key: "roxborough", name: "Roxborough", metro: "Philadelphia", adjacentKeys: ["manayunk", "east_falls"], lat: 40.037, lng: -75.221 },
  { id: "15983155-1a1f-4d68-b7ac-83fd73bd17f1", key: "brewerytown", name: "Brewerytown", metro: "Philadelphia", adjacentKeys: ["fairmount", "west_philly"], lat: 39.9755, lng: -75.183 },
  { id: "84ada221-ffd9-4f9d-8738-16e81ec29afe", key: "chinatown", name: "Chinatown", metro: "Philadelphia", adjacentKeys: ["center_city", "old_city"], lat: 39.955, lng: -75.155 },
  { id: "adcc4fa2-2a63-4dd7-86af-e3becf3c95e6", key: "society_hill", name: "Society Hill", metro: "Philadelphia", adjacentKeys: ["old_city", "queen_village", "center_city"], lat: 39.9445, lng: -75.146 },
];

const SEED_USERS: SeedUser[] = [
  { phoneNumber: "+15555550100", firstName: "You", neighborhoodKey: "rittenhouse", interests: ["coffee", "workouts", "workouts"], avatarSeed: "you-seed" },
  { phoneNumber: "+15555550101", firstName: "Jamie", neighborhoodKey: "rittenhouse", interests: ["workouts", "coffee", "food"], avatarSeed: "jamie-seed" },
  { phoneNumber: "+15555550102", firstName: "Sam", neighborhoodKey: "fairmount", interests: ["workouts", "workouts", "music"], avatarSeed: "sam-seed" },
  { phoneNumber: "+15555550103", firstName: "Alex", neighborhoodKey: "old_city", interests: ["music", "food", "creative"], avatarSeed: "alex-seed" },
  { phoneNumber: "+15555550104", firstName: "Riley", neighborhoodKey: "northern_liberties", interests: ["creative", "coffee", "events"], avatarSeed: "riley-seed" },
  { phoneNumber: "+15555550105", firstName: "Pat", neighborhoodKey: "south_philly", interests: ["workouts", "moms", "workouts"], avatarSeed: "pat-seed" },
  { phoneNumber: "+15555550106", firstName: "Sky", neighborhoodKey: "fishtown", interests: ["music", "creative", "events"], avatarSeed: "sky-seed" },
  { phoneNumber: "+15555550107", firstName: "Dee", neighborhoodKey: "graduate_hospital", interests: ["food", "workouts", "creative"], avatarSeed: "dee-seed" },
  { phoneNumber: "+15555550108", firstName: "Noor", neighborhoodKey: "center_city", interests: ["coffee", "creative", "food"], avatarSeed: "noor-seed" },
  { phoneNumber: "+15555550109", firstName: "Mar", neighborhoodKey: "west_philly", interests: ["creative", "music", "creative"], avatarSeed: "mar-seed" },
  { phoneNumber: "+15555550110", firstName: "Theo", neighborhoodKey: "manayunk", interests: ["workouts", "workouts", "moms"], avatarSeed: "theo-seed" },
  { phoneNumber: "+15555550111", firstName: "Ren", neighborhoodKey: "fairmount", interests: ["creative", "events", "workouts"], avatarSeed: "ren-seed" },
  ...generateExtraUsers(),
];

// Procedurally expand the seed dataset to ~50 users + ~50 plans so the feed
// feels alive on day one. Names + interest combos rotate against the
// neighborhood graph; phone numbers stay in the 555-01xx range. Idempotent —
// re-seeding with the same numbers updates the existing rows.
function generateExtraUsers(): SeedUser[] {
  const names = [
    "Avery", "Blair", "Casey", "Drew", "Emerson", "Frankie", "Gray", "Harper",
    "Indigo", "Jules", "Kai", "Logan", "Morgan", "Nico", "Owen", "Parker",
    "Quinn", "Reese", "Sage", "Taylor", "Umi", "Val", "Wren", "Xio",
    "Yael", "Zane", "Ari", "Bren", "Cody", "Dana", "Eli", "Fia",
    "Gio", "Hana", "Ivo", "Joss", "Kira", "Luca",
  ];
  const hoods: string[] = [
    "center_city", "rittenhouse", "old_city", "northern_liberties",
    "fishtown", "south_philly", "west_philly", "manayunk", "fairmount",
    "graduate_hospital",
  ];
  const interestPalette: InterestTag[][] = [
    ["coffee", "workouts", "workouts"],
    ["food", "music", "events"],
    ["creative", "creative", "coffee"],
    ["workouts", "moms", "workouts"],
    ["workouts", "creative", "food"],
    ["music", "events", "creative"],
    ["coffee", "creative", "events"],
    ["workouts", "workouts", "workouts"],
    ["food", "coffee", "workouts"],
    ["moms", "workouts", "creative"],
  ];
  const users: SeedUser[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    const num = 200 + i; // phone tail starts at 200 so it doesn't collide with the curated 100-111 block.
    const phoneNumber = `+1555555${String(num).padStart(4, "0")}`;
    users.push({
      phoneNumber,
      firstName: name,
      neighborhoodKey: hoods[i % hoods.length]!,
      interests: interestPalette[i % interestPalette.length]!,
      avatarSeed: `${name.toLowerCase()}-seed-${i}`,
    });
  }
  return users;
}

const SEED_PLANS: SeedPlan[] = [
  {
    creatorPhone: "+15555550101",
    title: "Yoga in Rittenhouse Square",
    neighborhoodKey: "rittenhouse",
    location: { name: "Rittenhouse Square", address: "1800 Walnut St, Philadelphia, PA", lat: 39.949, lng: -75.171 },
    daysFromNow: 3,
    time: "09:00",
    isFlexibleTime: true,
    endHoursAfterStart: 1,
    tags: ["workouts", "coffee"],
    description: "Bring a mat. Coffee after if folks want.",
    hostEmoji: "🧘",
    going: ["+15555550101", "+15555550100", "+15555550104"],
    interested: ["+15555550102", "+15555550103"],
    messages: [
      { senderPhone: "+15555550104", body: "Which corner are we meeting?", minutesAgo: 220 },
      { senderPhone: "+15555550101", body: "Southwest side — near the fountain.", minutesAgo: 90 },
    ],
  },
  {
    creatorPhone: "+15555550102",
    title: "Sunrise run — Schuylkill Banks",
    neighborhoodKey: "fairmount",
    location: { name: "Schuylkill Banks Trailhead", address: "2500 Walnut St, Philadelphia, PA", lat: 39.9513, lng: -75.182 },
    daysFromNow: 1,
    time: "06:30",
    isFlexibleTime: false,
    endHoursAfterStart: 2,
    tags: ["workouts", "workouts"],
    description: "Easy pace — regroup at the bridge.",
    hostEmoji: "🏃",
    going: ["+15555550102", "+15555550105"],
    interested: ["+15555550100", "+15555550101"],
    messages: [],
  },
  {
    creatorPhone: "+15555550103",
    title: "Live music at Johnny Brenda's",
    neighborhoodKey: "fishtown",
    location: { name: "Johnny Brenda's", address: "1201 N Frankford Ave, Philadelphia, PA", lat: 39.9714, lng: -75.1339 },
    daysFromNow: 2,
    time: "20:00",
    isFlexibleTime: false,
    tags: ["music", "food"],
    description: "Local bands — small cover at the door.",
    hostEmoji: "🎶",
    going: ["+15555550103", "+15555550104"],
    interested: ["+15555550105", "+15555550100"],
    messages: [],
  },
  {
    creatorPhone: "+15555550104",
    title: "First Friday crawl — galleries",
    neighborhoodKey: "old_city",
    location: { name: "Old City Arts District", address: "N 3rd St & Market St, Philadelphia, PA" },
    daysFromNow: 5,
    time: "Flexible",
    isFlexibleTime: true,
    tags: ["creative", "events"],
    description: "Loose route — meet at the flagpole then drift.",
    hostEmoji: "🎨",
    going: ["+15555550104"],
    interested: ["+15555550100", "+15555550103"],
    messages: [],
  },
  {
    creatorPhone: "+15555550106",
    title: "Karaoke at Drinker's",
    neighborhoodKey: "fishtown",
    location: { name: "Drinker's Pub", address: "1903 Chestnut St, Philadelphia, PA", lat: 39.953, lng: -75.172 },
    daysFromNow: 4,
    time: "21:00",
    isFlexibleTime: false,
    endHoursAfterStart: 3,
    tags: ["music", "food"],
    description: "No judgment zone — sign up at the bar.",
    hostEmoji: "🎤",
    going: ["+15555550106", "+15555550103", "+15555550107"],
    interested: ["+15555550100", "+15555550101", "+15555550109"],
    messages: [
      { senderPhone: "+15555550107", body: "Putting Mr. Brightside on my list 😤", minutesAgo: 540 },
    ],
  },
  {
    creatorPhone: "+15555550107",
    title: "Morning walk + coffee",
    neighborhoodKey: "graduate_hospital",
    location: { name: "Rittenhouse Square", address: "1800 Walnut St, Philadelphia, PA", lat: 39.949, lng: -75.171 },
    daysFromNow: 6,
    time: "09:00",
    isFlexibleTime: true,
    endHoursAfterStart: 1,
    tags: ["workouts", "coffee"],
    description: "Easy loop around the square, grabbing coffee after ☕️",
    hostEmoji: "☕",
    going: ["+15555550107"],
    interested: ["+15555550100", "+15555550101", "+15555550111"],
    messages: [],
  },
  {
    creatorPhone: "+15555550108",
    title: "Looking for — beginner yoga partner?",
    neighborhoodKey: "center_city",
    location: { name: "", address: "" },
    daysFromNow: 2,
    time: "Flexible",
    isFlexibleTime: true,
    tags: ["workouts", "workouts"],
    description: "Anyone go to a beginner studio and wouldn't mind I tagged along? Would love to grab coffee after too 🧘",
    hostEmoji: "🧘",
    going: ["+15555550108"],
    interested: ["+15555550101", "+15555550111"],
    messages: [],
  },
  {
    creatorPhone: "+15555550109",
    title: "Thrifting on Baltimore Ave",
    neighborhoodKey: "west_philly",
    location: { name: "Baltimore Ave Thrift Row", address: "4400 Baltimore Ave, Philadelphia, PA", lat: 39.9494, lng: -75.2098 },
    daysFromNow: 5,
    time: "13:00",
    isFlexibleTime: false,
    endHoursAfterStart: 3,
    tags: ["creative", "creative"],
    description: "Three shops, two hours, one mediocre iced coffee.",
    hostEmoji: "🧥",
    going: ["+15555550109", "+15555550104"],
    interested: ["+15555550100", "+15555550106"],
    messages: [],
  },
  {
    creatorPhone: "+15555550110",
    title: "Dogs at Manayunk towpath",
    neighborhoodKey: "manayunk",
    location: { name: "Manayunk Tow Path", address: "Manayunk, Philadelphia, PA", lat: 40.0253, lng: -75.2214 },
    daysFromNow: 1,
    time: "16:30",
    isFlexibleTime: false,
    endHoursAfterStart: 2,
    tags: ["moms", "workouts"],
    description: "Bring your dog or just join — easy walk + chat.",
    hostEmoji: "🐕",
    going: ["+15555550110", "+15555550105"],
    interested: ["+15555550100", "+15555550102"],
    messages: [],
  },
  {
    creatorPhone: "+15555550111",
    title: "Open mic — Tattooed Mom",
    neighborhoodKey: "south_philly",
    location: { name: "Tattooed Mom", address: "530 South St, Philadelphia, PA", lat: 39.9412, lng: -75.1525 },
    daysFromNow: 7,
    time: "20:30",
    isFlexibleTime: false,
    tags: ["creative", "events", "music"],
    description: "Reading something I wrote. Moral support welcome.",
    hostEmoji: "📚",
    going: ["+15555550111", "+15555550104"],
    interested: ["+15555550103", "+15555550109"],
    messages: [],
  },
  {
    creatorPhone: "+15555550102",
    title: "Sunday long run — 8 miles",
    neighborhoodKey: "fairmount",
    location: { name: "Lloyd Hall", address: "1 Boathouse Row, Philadelphia, PA", lat: 39.9665, lng: -75.18 },
    daysFromNow: 6,
    time: "07:00",
    isFlexibleTime: false,
    endHoursAfterStart: 2,
    tags: ["workouts", "workouts"],
    description: "Easy pace, regroup at the loop turnaround.",
    hostEmoji: "🏃",
    going: ["+15555550102", "+15555550105", "+15555550110"],
    interested: ["+15555550100"],
    messages: [],
  },
  ...generateExtraPlans(),
];

function generateExtraPlans(): SeedPlan[] {
  // Build varied plans across all generated users + the curated names.
  const templates: Array<{
    title: string;
    location: SeedPlan["location"];
    neighborhoodKey: string;
    tags: InterestTag[];
    hostEmoji: string;
    time: string;
    isFlexibleTime: boolean;
    description: string;
  }> = [
    { title: "Pickleball at the rec center", neighborhoodKey: "south_philly", location: { name: "Palumbo Rec Center", address: "700 Bainbridge St" }, tags: ["workouts", "events"], hostEmoji: "🏓", time: "18:00", isFlexibleTime: false, description: "Open play — bring a paddle if you have one." },
    { title: "Wine and cheese on the porch", neighborhoodKey: "graduate_hospital", location: { name: "Front porch · S 23rd", address: "South 23rd Street" }, tags: ["food", "workouts"], hostEmoji: "🍷", time: "19:30", isFlexibleTime: false, description: "Bring a bottle, I've got the spread." },
    { title: "Sketch crawl — Italian Market", neighborhoodKey: "south_philly", location: { name: "9th Street Italian Market", address: "919 S 9th St" }, tags: ["creative", "creative"], hostEmoji: "✏️", time: "11:00", isFlexibleTime: true, description: "Pen + paper. Coffee stop midway." },
    { title: "Friday trivia at Bards", neighborhoodKey: "rittenhouse", location: { name: "The Bards", address: "2013 Walnut St" }, tags: ["events", "food"], hostEmoji: "🎲", time: "20:00", isFlexibleTime: false, description: "Need 2 more for the team. Decent at music + history." },
    { title: "Morning bike along MLK Dr.", neighborhoodKey: "fairmount", location: { name: "Lloyd Hall trailhead", address: "1 Boathouse Row" }, tags: ["workouts", "workouts"], hostEmoji: "🚲", time: "08:00", isFlexibleTime: false, description: "Closed to cars — easy 10mi out and back." },
    { title: "Live jazz at Chris' Jazz Café", neighborhoodKey: "center_city", location: { name: "Chris' Jazz Café", address: "1421 Sansom St" }, tags: ["music", "creative"], hostEmoji: "🎷", time: "21:00", isFlexibleTime: false, description: "Late set, cover at the door." },
    { title: "Dog meetup at Schuylkill River Park", neighborhoodKey: "rittenhouse", location: { name: "Schuylkill River Dog Park", address: "300 S 25th St" }, tags: ["moms", "workouts"], hostEmoji: "🐶", time: "16:00", isFlexibleTime: true, description: "My pup needs friends. Bring yours!" },
    { title: "Looking for — running buddy", neighborhoodKey: "west_philly", location: { name: "", address: "" }, tags: ["workouts", "workouts"], hostEmoji: "🏃", time: "Flexible", isFlexibleTime: true, description: "Building up to a 10k. 9-10 min/mi pace." },
    { title: "Vinyl listening night", neighborhoodKey: "northern_liberties", location: { name: "Liberty Lands park", address: "913 N 3rd St" }, tags: ["music", "creative"], hostEmoji: "💿", time: "19:00", isFlexibleTime: false, description: "Bring an album you want to play start to finish." },
    { title: "Sunday morning farmer's market", neighborhoodKey: "south_philly", location: { name: "Headhouse Farmers Market", address: "2nd & Lombard St" }, tags: ["food", "workouts"], hostEmoji: "🥕", time: "10:00", isFlexibleTime: true, description: "Want to hit the early vendors before the rush." },
    { title: "Pottery throw-in", neighborhoodKey: "fishtown", location: { name: "The Clay Studio", address: "1425 N American St" }, tags: ["creative", "workouts"], hostEmoji: "🏺", time: "18:30", isFlexibleTime: false, description: "Drop-in session — first time okay." },
    { title: "Looking for — concert buddy on Friday", neighborhoodKey: "fishtown", location: { name: "", address: "" }, tags: ["music"], hostEmoji: "🎟️", time: "Flexible", isFlexibleTime: true, description: "Extra ticket to the show at Union Transfer — say hi if you'd be down." },
    { title: "Co-work morning at Ultimo", neighborhoodKey: "graduate_hospital", location: { name: "Ultimo Coffee", address: "1900 S 15th St" }, tags: ["coffee"], hostEmoji: "💻", time: "09:30", isFlexibleTime: false, description: "Heads down for two hours, lunch after if anyone wants." },
    { title: "Run group — easy 5k", neighborhoodKey: "fairmount", location: { name: "Eakins Oval", address: "2451 Benjamin Franklin Pkwy" }, tags: ["workouts", "workouts"], hostEmoji: "👟", time: "07:30", isFlexibleTime: false, description: "Conversational pace. Coffee after." },
    { title: "Movie night — Bryant Park outdoor screening", neighborhoodKey: "center_city", location: { name: "Logan Square", address: "Logan Square, Philadelphia, PA" }, tags: ["events", "creative"], hostEmoji: "🎬", time: "20:30", isFlexibleTime: false, description: "BYO blanket and snacks." },
    { title: "Brunch at Sabrina's", neighborhoodKey: "south_philly", location: { name: "Sabrina's Café", address: "910 Christian St" }, tags: ["food", "coffee"], hostEmoji: "🥞", time: "11:30", isFlexibleTime: false, description: "Always a wait, more fun together." },
    { title: "Looking for — gallery night company", neighborhoodKey: "old_city", location: { name: "", address: "" }, tags: ["creative", "events"], hostEmoji: "🖼️", time: "Flexible", isFlexibleTime: true, description: "First Friday is too good to do solo." },
    { title: "Climbing at Reach", neighborhoodKey: "fishtown", location: { name: "Reach Climbing", address: "Bridgeport, PA" }, tags: ["workouts"], hostEmoji: "🧗", time: "18:00", isFlexibleTime: false, description: "Top rope partner welcome. Day pass works." },
    { title: "Cold plunge + breakfast", neighborhoodKey: "rittenhouse", location: { name: "Greater Phila YMCA", address: "1425 Arch St" }, tags: ["workouts", "workouts"], hostEmoji: "🧊", time: "07:00", isFlexibleTime: false, description: "Don't think, just plunge." },
    { title: "Thrifting Saturday — Frankford Ave", neighborhoodKey: "fishtown", location: { name: "Jinxed Fishtown", address: "1331 Frankford Ave" }, tags: ["creative", "creative"], hostEmoji: "🧥", time: "13:00", isFlexibleTime: false, description: "Three shops, slow morning." },
    { title: "Looking for — board game night?", neighborhoodKey: "west_philly", location: { name: "", address: "" }, tags: ["events", "creative"], hostEmoji: "🎲", time: "Flexible", isFlexibleTime: true, description: "Have Catan, Wingspan, Codenames. Looking for 2-4 players." },
    { title: "Sunset walk · Penn Treaty Park", neighborhoodKey: "fishtown", location: { name: "Penn Treaty Park", address: "1199 N Delaware Ave" }, tags: ["workouts", "workouts"], hostEmoji: "🌅", time: "19:00", isFlexibleTime: false, description: "Best skyline view in the city, easy 30min walk." },
    { title: "Beer garden — Frankford Hall", neighborhoodKey: "fishtown", location: { name: "Frankford Hall", address: "1210 Frankford Ave" }, tags: ["food", "music"], hostEmoji: "🍻", time: "17:00", isFlexibleTime: false, description: "Big tables — easy to merge with friends-of-friends." },
    { title: "Art crawl + happy hour", neighborhoodKey: "old_city", location: { name: "Old City galleries", address: "N 3rd St" }, tags: ["creative", "food"], hostEmoji: "🍸", time: "18:00", isFlexibleTime: false, description: "Three galleries then drinks at the corner spot." },
    { title: "Sunday yoga · Race Street Pier", neighborhoodKey: "old_city", location: { name: "Race Street Pier", address: "N Christopher Columbus Blvd" }, tags: ["workouts", "workouts"], hostEmoji: "🧘", time: "09:00", isFlexibleTime: false, description: "Free outdoor flow. Bring a mat." },
    { title: "Looking for — coffee + co-work", neighborhoodKey: "rittenhouse", location: { name: "", address: "" }, tags: ["coffee"], hostEmoji: "☕", time: "Flexible", isFlexibleTime: true, description: "Working remote and would love some company." },
    { title: "Manayunk towpath ride", neighborhoodKey: "manayunk", location: { name: "Manayunk Tow Path", address: "Manayunk, Philadelphia, PA" }, tags: ["workouts", "workouts"], hostEmoji: "🚴", time: "10:00", isFlexibleTime: false, description: "Easy out and back to Conshy." },
    { title: "Bar trivia at Fado", neighborhoodKey: "center_city", location: { name: "Fado Irish Pub", address: "1500 Locust St" }, tags: ["events", "food"], hostEmoji: "🍀", time: "19:30", isFlexibleTime: false, description: "Need a fourth — pop culture-heavy." },
    { title: "Comedy show at Helium", neighborhoodKey: "center_city", location: { name: "Helium Comedy Club", address: "2031 Sansom St" }, tags: ["creative", "events", "music"], hostEmoji: "🎤", time: "20:00", isFlexibleTime: false, description: "Friday late show — never disappoints." },
    { title: "Looking for — beach day Saturday", neighborhoodKey: "south_philly", location: { name: "", address: "" }, tags: ["workouts", "events"], hostEmoji: "🏖️", time: "Flexible", isFlexibleTime: true, description: "Driving to Cape May. Two seats open." },
    { title: "Run + coffee — Saturday", neighborhoodKey: "graduate_hospital", location: { name: "Rival Bros Coffee Bar", address: "2400 Lombard St" }, tags: ["workouts", "coffee"], hostEmoji: "☕", time: "08:00", isFlexibleTime: false, description: "Easy 3 miles then a long coffee." },
    { title: "Bike polo · FDR Park", neighborhoodKey: "south_philly", location: { name: "FDR Park", address: "FDR Park, Philadelphia, PA" }, tags: ["workouts", "events"], hostEmoji: "🚲", time: "16:00", isFlexibleTime: false, description: "Total beginners encouraged. Loaner bikes." },
    { title: "Sunset drinks · Cira Green", neighborhoodKey: "west_philly", location: { name: "Cira Green Rooftop", address: "129 S 30th St" }, tags: ["food", "music"], hostEmoji: "🍹", time: "18:30", isFlexibleTime: false, description: "Rooftop park with city views. BYO welcome." },
    { title: "Reading at Big Blue Marble", neighborhoodKey: "west_philly", location: { name: "Big Blue Marble Bookstore", address: "551 Carpenter Ln" }, tags: ["creative", "events"], hostEmoji: "📖", time: "19:00", isFlexibleTime: false, description: "Local author reading + Q&A." },
    { title: "Looking for — soccer pickup", neighborhoodKey: "fairmount", location: { name: "", address: "" }, tags: ["workouts", "events"], hostEmoji: "⚽", time: "Flexible", isFlexibleTime: true, description: "Have 6, need 4 more for a real game." },
    { title: "Pottery + drinks", neighborhoodKey: "northern_liberties", location: { name: "Bourbon & Branch", address: "705 N 2nd St" }, tags: ["creative", "food"], hostEmoji: "🏺", time: "19:00", isFlexibleTime: false, description: "Paint your own pottery night — drinks included." },
    { title: "Looking for — board game host (2-4 players)", neighborhoodKey: "south_philly", location: { name: "", address: "" }, tags: ["events"], hostEmoji: "🎯", time: "Flexible", isFlexibleTime: true, description: "I'll bring the games, someone bring the apartment." },
    { title: "Coffee tasting at Elixr", neighborhoodKey: "rittenhouse", location: { name: "Elixr Coffee", address: "207 S Sydenham St" }, tags: ["coffee", "food"], hostEmoji: "☕", time: "10:30", isFlexibleTime: false, description: "Pour-over flight + chat about beans." },
    { title: "Volunteer · river cleanup", neighborhoodKey: "fairmount", location: { name: "Schuylkill Banks", address: "Schuylkill Banks Trailhead" }, tags: ["events", "workouts"], hostEmoji: "🌱", time: "09:00", isFlexibleTime: false, description: "Gloves + bags provided. Coffee after at Sip-n-Glo." },
  ];
  const userPhones: string[] = [];
  for (let i = 0; i < 38; i++) {
    userPhones.push(`+1555555${String(200 + i).padStart(4, "0")}`);
  }
  const curatedPhones = [
    "+15555550100", "+15555550101", "+15555550102", "+15555550103",
    "+15555550104", "+15555550105", "+15555550106", "+15555550107",
    "+15555550108", "+15555550109", "+15555550110", "+15555550111",
  ];
  const allPhones = [...curatedPhones, ...userPhones];
  const plans: SeedPlan[] = [];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i]!;
    const creatorPhone = allPhones[i % allPhones.length]!;
    // Days from now: distribute across past 3 days through next 21 days for variety.
    const daysFromNow = (i % 24) - 2;
    // Going list = 2-4 random users including creator. Interested = 1-3.
    const going = [creatorPhone];
    const interested: string[] = [];
    for (let g = 0; g < 2 + (i % 3); g++) {
      const idx = (i * 7 + g * 13) % allPhones.length;
      const phone = allPhones[idx]!;
      if (phone !== creatorPhone && !going.includes(phone)) going.push(phone);
    }
    for (let s = 0; s < 1 + (i % 3); s++) {
      const idx = (i * 11 + s * 17 + 5) % allPhones.length;
      const phone = allPhones[idx]!;
      if (phone !== creatorPhone && !going.includes(phone) && !interested.includes(phone)) {
        interested.push(phone);
      }
    }
    const isLooking = t.title.toLowerCase().startsWith("looking for");
    plans.push({
      creatorPhone,
      title: t.title,
      neighborhoodKey: t.neighborhoodKey,
      location: t.location,
      daysFromNow,
      time: t.time,
      isFlexibleTime: t.isFlexibleTime,
      endHoursAfterStart: t.isFlexibleTime ? undefined : 2,
      tags: t.tags,
      description: t.description,
      hostEmoji: t.hostEmoji,
      going,
      interested,
      messages: [],
      planKind: isLooking ? "looking_for" : "standard",
    });
  }
  return plans;
}

function dateForOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoEndForPlan(date: string, time: string, hoursAfterStart: number | undefined): string | undefined {
  if (!hoursAfterStart) return undefined;
  if (!/^\d{2}:\d{2}$/.test(time)) return undefined;
  const [h, m] = time.split(":").map(Number);
  const start = new Date(date + "T00:00:00.000Z");
  start.setUTCHours(h, m, 0, 0);
  const end = new Date(start.getTime() + hoursAfterStart * 60 * 60 * 1000);
  return end.toISOString();
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

/** Fake +1 numbers and demo plans — off in production unless SEED_DEMO_ACCOUNTS=1. Real auth accounts only use Twilio Verify. */
function includeSeedDemoData(): boolean {
  const explicit = process.env.SEED_DEMO_ACCOUNTS?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "yes") return true;
  if (explicit === "0" || explicit === "false" || explicit === "no") return false;
  return process.env.NODE_ENV !== "production";
}

/** Upsert the full pinned Philly list (adds missing hoods; refreshes adjacency). */
function ensurePhillyNeighborhoods(): Map<string, string> {
  const neighborhoodIdByKey = new Map<string, string>();
  const recordsByKey = new Map<string, ReturnType<typeof seedNeighborhood>>();
  for (const n of PHILLY_NEIGHBORHOODS) {
    const record = seedNeighborhood(n);
    neighborhoodIdByKey.set(n.key, record.id);
    recordsByKey.set(n.key, record);
  }
  for (const n of PHILLY_NEIGHBORHOODS) {
    const record = recordsByKey.get(n.key);
    if (!record) continue;
    record.adjacent = n.adjacentKeys
      .map((k) => neighborhoodIdByKey.get(k))
      .filter((id): id is string => Boolean(id));
  }

  const before = store.listNeighborhoods().length;
  if (before === 0) {
    // Fresh DB — replaceAll is fine (nothing to preserve).
    store.seedNeighborhoods(Array.from(recordsByKey.values()));
  } else {
    // Prod may have been seeded with a partial list; upsert missing / refresh edges
    // without wiping Mongo `_id`s (legacy user rows may still reference them).
    for (const record of recordsByKey.values()) {
      store.ensureNeighborhood(record);
    }
  }
  const after = store.listNeighborhoods().length;
  if (after !== before) {
    console.log(`[seed] neighborhoods ${before} → ${after}`);
  }
  return neighborhoodIdByKey;
}

/**
 * Remap legacy Mongo ObjectId neighborhood refs to pinned UUIDs, and clear
 * ids that don't resolve to any hood. Runs on every boot so orphaned profile
 * fields can't keep blocking post/feed for real accounts.
 */
function repairUserNeighborhoodIds(): void {
  let repaired = 0;
  for (const user of store.listUsers()) {
    const raw = user.neighborhoodIds?.length
      ? user.neighborhoodIds
      : user.neighborhoodId
        ? [user.neighborhoodId]
        : [];
    const resolved = [
      ...new Set(
        raw
          .map((id) => store.resolveNeighborhoodId(id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const primary = resolved[0] ?? null;
    const samePrimary = (user.neighborhoodId ?? null) === primary;
    const sameList =
      (user.neighborhoodIds?.length ?? 0) === resolved.length &&
      resolved.every((id, i) => user.neighborhoodIds?.[i] === id);
    if (samePrimary && sameList) continue;
    store.updateUser(user.id, {
      neighborhoodId: primary,
      neighborhoodIds: resolved,
    });
    repaired += 1;
    console.log(
      `[seed] repaired neighborhood refs for ${user.phoneNumber}` +
        (primary ? ` → ${primary}` : " → (cleared)"),
    );
  }
  if (repaired > 0) {
    console.log(`[seed] repaired neighborhood refs on ${repaired} user(s)`);
  }
}

export async function seedIfEmpty(): Promise<void> {
  const neighborhoodIdByKey = ensurePhillyNeighborhoods();
  repairUserNeighborhoodIds();

  if (!includeSeedDemoData()) {
    console.log("[seed] skipped demo users/plans (production). Only Verify sign-ups create accounts. Set SEED_DEMO_ACCOUNTS=1 to seed.");
    return;
  }

  const userIdByPhone = new Map<string, string>();
  for (const seed of SEED_USERS) {
    const neighborhoodId = neighborhoodIdByKey.get(seed.neighborhoodKey) ?? null;
    let user = await findUserByPhone(seed.phoneNumber);
    if (!user) user = await createUser(seed.phoneNumber, { accountSource: "seed" });
    await updateUser(user.id, {
      accountSource: "seed",
      firstName: seed.firstName,
      neighborhoodId,
      neighborhoodIds: neighborhoodId ? [neighborhoodId] : [],
      interests: seed.interests,
      avatarSeed: seed.avatarSeed,
      avatarStyle: "avataaars",
      onboardingComplete: true,
    });
    userIdByPhone.set(seed.phoneNumber, user.id);
  }

  for (const seed of SEED_PLANS) {
    const creatorId = userIdByPhone.get(seed.creatorPhone);
    const neighborhoodId = neighborhoodIdByKey.get(seed.neighborhoodKey);
    if (!creatorId || !neighborhoodId) continue;

    // Skip if this exact demo plan already exists (idempotent on restart).
    const alreadySeeded = store
      .listPlansByCreator(creatorId)
      .some((p) => p.title === seed.title);
    if (alreadySeeded) continue;

    const date = dateForOffset(seed.daysFromNow);
    const planKind = seed.planKind ?? "standard";
    const isLookingFor = planKind === "looking_for";
    const plan = store.createPlan({
      creatorId,
      title: seed.title,
      neighborhoodId,
      location: seed.location.name
        ? seed.location
        : { name: "Flexible location", address: "Flexible location" },
      date,
      time: seed.isFlexibleTime ? "" : seed.time,
      isFlexibleTime: seed.isFlexibleTime,
      isFlexibleLocation: isLookingFor && !seed.location.name,
      endTime: isoEndForPlan(date, seed.time, seed.endHoursAfterStart),
      tags: seed.tags,
      description: seed.description,
      hostEmoji: seed.hostEmoji,
      planKind,
      visibility: "everyone",
      visibilityCommunityTag: null,
      isRecurring: false,
      lockedAt: null,
    });

    const goingIds: string[] = [];
    for (const phone of seed.going) {
      const userId = userIdByPhone.get(phone);
      if (userId) {
        store.upsertParticipation(plan.id, userId, "going");
        goingIds.push(userId);
      }
    }
    for (const phone of seed.interested) {
      const userId = userIdByPhone.get(phone);
      if (userId) store.upsertParticipation(plan.id, userId, "interested");
    }

    if (seed.messages.length > 0 || goingIds.length > 0) {
      const conv = store.ensureGroupConversation(plan.id, [creatorId, ...goingIds]);
      for (const m of seed.messages) {
        const senderId = userIdByPhone.get(m.senderPhone);
        if (!senderId) continue;
        const created = store.createMessage(conv.id, senderId, m.body);
        (created as { createdAt: string }).createdAt = isoMinutesAgo(m.minutesAgo);
      }
    }
  }
}

function seedNeighborhood(seed: SeedNeighborhood) {
  // Pinned id from SeedNeighborhood — never randomize. See note on
  // PHILLY_NEIGHBORHOODS for why.
  return {
    id: seed.id,
    name: seed.name,
    metro: seed.metro,
    adjacent: [] as string[],
    lat: seed.lat,
    lng: seed.lng,
  };
}
