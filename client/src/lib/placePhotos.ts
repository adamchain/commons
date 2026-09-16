/** Editorial photos used by Explore Places, forum heroes, and interest tiles. */

export const HERO_PHOTO = "/landing/photo-shadows.jpg";

export const PLACE_CATEGORIES = ["Coffee", "Food", "Drinks", "Fitness", "Parks", "Culture"] as const;

export const PLACE_TILES: Array<{ label: string; photo: string }> = [
  { label: "Coffee", photo: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=600&q=80" },
  { label: "Food", photo: "https://images.unsplash.com/photo-1574966739987-65e38db0f7ce?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Drinks", photo: "https://images.unsplash.com/photo-1568644396922-5c3bfae12521?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Fitness", photo: "https://images.unsplash.com/photo-1603455778956-d71832eafa4e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Parks", photo: "https://images.unsplash.com/photo-1615373111465-965023eb989c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Culture", photo: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
];

const BY_LABEL: Record<string, string> = Object.fromEntries(
  PLACE_TILES.map((t) => [t.label.toLowerCase(), t.photo]),
);

const BY_TAG: Record<string, string> = {
  coffee: BY_LABEL.coffee,
  food: BY_LABEL.food,
  drinks: BY_LABEL.drinks,
  workouts: BY_LABEL.fitness,
  wellness: BY_LABEL.fitness,
  walks: BY_LABEL.parks,
  creative: BY_LABEL.culture,
  events: BY_LABEL.culture,
  music: BY_LABEL.culture,
  books: BY_LABEL.culture,
  night_out: BY_LABEL.drinks,
  games: BY_LABEL.culture,
  cowork: BY_LABEL.coffee,
  moms: BY_LABEL.parks,
  new_to_philly: BY_LABEL.parks,
  sober: BY_LABEL.coffee,
};

export function photoForInterest(tag: string | null | undefined): string {
  if (!tag) return HERO_PHOTO;
  return BY_TAG[tag] ?? BY_LABEL[tag.toLowerCase()] ?? HERO_PHOTO;
}
