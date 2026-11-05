import { Avatar } from "./Avatar";
import { ChatPersonLink } from "./ChatPersonLink";
import { BottomSheet } from "./ui/BottomSheet";
import type { NavFromState } from "../lib/navState";
import type { PublicUser } from "../types/shared";

/**
 * A bottom sheet listing people resolved from a set of user ids against a
 * roster — used to show who reacted to a message or who voted in a poll.
 * Each row opens that person's profile when `profileFrom` is provided.
 */
export function PeopleListSheet({
  title,
  userIds,
  people,
  profileFrom,
  onClose,
}: {
  title: string;
  userIds: string[];
  people: PublicUser[];
  profileFrom?: NavFromState;
  onClose: () => void;
}) {
  const byId = new Map(people.map((p) => [p.id, p]));
  return (
    <BottomSheet onClose={onClose} ariaLabel={title}>
      <h2 className="sheet-title">{title}</h2>
      <div className="people-list-sheet">
        {userIds.map((id) => (
          <PersonRow key={id} id={id} person={byId.get(id)} profileFrom={profileFrom} />
        ))}
      </div>
    </BottomSheet>
  );
}

/** One avatar + name row, linking to the profile when resolvable. */
export function PersonRow({
  id,
  person,
  profileFrom,
}: {
  id: string;
  person: PublicUser | undefined;
  profileFrom?: NavFromState;
}) {
  const name = person
    ? [person.firstName, person.lastName].filter(Boolean).join(" ") || person.firstName
    : "Former member";
  const inner = (
    <>
      <Avatar
        seed={person?.avatarSeed ?? id}
        style={person?.avatarStyle}
        photoDataUrl={person?.avatarPhotoDataUrl}
        params={person?.avatarParams}
        name={person?.firstName}
        size="sm"
      />
      <span className="people-list-name">{name}</span>
    </>
  );
  return person && profileFrom ? (
    <ChatPersonLink
      userId={person.id}
      name={person.firstName}
      state={profileFrom}
      className="people-list-row"
    >
      {inner}
    </ChatPersonLink>
  ) : (
    <div className="people-list-row">{inner}</div>
  );
}
