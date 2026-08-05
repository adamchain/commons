import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Coffee,
  Gamepad2,
  Heart,
  Laptop,
  Leaf,
  MapPin,
  Moon,
  Music,
  Palette,
  Sparkles,
  Trees,
  UtensilsCrossed,
  Users,
  Wine,
} from "lucide-react";
import type { InterestTag } from "../types/shared";

export type InterestVisual = {
  Icon: LucideIcon;
  iconColor: string;
  tint: string;
};

/** Lucide icon + tint well for interest/forum/chat rows. Zero emojis. */
export const INTEREST_VISUAL: Record<InterestTag, InterestVisual> = {
  coffee: { Icon: Coffee, iconColor: "#B8864A", tint: "#F5E4C8" },
  food: { Icon: UtensilsCrossed, iconColor: "#8A6A2A", tint: "#F5DDBB" },
  drinks: { Icon: Wine, iconColor: "#6B5AA0", tint: "#D8D0F0" },
  events: { Icon: Sparkles, iconColor: "#A05B5B", tint: "#F0D8D8" },
  night_out: { Icon: Moon, iconColor: "#6B5AA0", tint: "#D8D0F0" },
  music: { Icon: Music, iconColor: "#7A5BA0", tint: "#D8D0F0" },
  books: { Icon: BookOpen, iconColor: "#7A5BA0", tint: "#D8D0F0" },
  walks: { Icon: Trees, iconColor: "#3A6A3A", tint: "#C8DDC8" },
  workouts: { Icon: Activity, iconColor: "#5B8FBF", tint: "#C8DCF0" },
  wellness: { Icon: Leaf, iconColor: "#7A8F6A", tint: "#D4E0CC" },
  creative: { Icon: Palette, iconColor: "#A05B5B", tint: "#F0D8D8" },
  games: { Icon: Gamepad2, iconColor: "#5B8FBF", tint: "#C8DCF0" },
  cowork: { Icon: Laptop, iconColor: "#B8864A", tint: "#F5E4C8" },
  moms: { Icon: Users, iconColor: "#A05B5B", tint: "#F0D8D8" },
  new_to_philly: { Icon: MapPin, iconColor: "#5B8FBF", tint: "#C8DCF0" },
  sober: { Icon: Heart, iconColor: "#7A8F6A", tint: "#D4E0CC" },
};

const FALLBACK: InterestVisual = {
  Icon: Sparkles,
  iconColor: "#8A8A9A",
  tint: "#EDE5D8",
};

export function interestVisual(tag: string | null | undefined): InterestVisual {
  if (tag && tag in INTEREST_VISUAL) return INTEREST_VISUAL[tag as InterestTag];
  return FALLBACK;
}
