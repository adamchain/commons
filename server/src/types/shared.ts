export type PlanTag = "coffee" | "workout" | "social" | "outdoors" | "events";
export type ParticipationState = "interested" | "going";

export interface PublicUser {
  id: string;
  displayName: string;
}

export interface PlanDTO {
  id: string;
  title: string;
  creator: PublicUser;
  location: { name: string; address: string };
  date: string;
  time: string;
  isFlexibleTime: boolean;
  tags: PlanTag[];
  description?: string;
  participants: {
    going: PublicUser[];
    interested: PublicUser[];
  };
  myState: ParticipationState | null;
}
