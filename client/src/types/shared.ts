export type PlanTag = "coffee" | "workout" | "social" | "outdoors" | "events";
export type ParticipationState = "interested" | "going";

export interface PlanDTO {
  id: string;
  title: string;
  creator: { id: string; displayName: string };
  location: { name: string; address: string };
  date: string;
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
