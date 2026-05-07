import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { formatPlanDate } from "../lib/format";
import {
  HOST_TAG_LABELS,
  type HostTag,
  type PlanDTO,
  type PublicUser,
} from "../types/shared";

interface ProfilePayload {
  user: PublicUser;
  neighborhood: { id: string; name: string; metro: string } | null;
  tagCounts: Record<HostTag, number>;
  upcoming: PlanDTO[];
  past: Array<{ id: string; title: string; date: string; wentCount: number }>;
  sharedPlanId: string | null;
}

export function ProfilePage() {
  const { userId = "" } = useParams();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);

  useEffect(() => {
    void api<ProfilePayload>(`/api/profile/${userId}`).then(setProfile).catch(() => setProfile(null));
  }, [userId]);

  if (!profile) return <LoadingScreen tagline="Loading profile" />;

  const topTags: Array<[HostTag, number]> = (Object.entries(profile.tagCounts) as Array<[HostTag, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link to="/" className="detail-back">← Back</Link>
      </header>

      <section className="profile-hero">
        <Avatar
          seed={profile.user.avatarSeed}
          style={profile.user.avatarStyle}
          photoDataUrl={profile.user.avatarPhotoDataUrl}
          name={profile.user.firstName}
          size="xl"
        />
        <div className="profile-name">{profile.user.firstName}</div>
        {profile.neighborhood && (
          <div className="profile-neighborhood">📍 {profile.neighborhood.name}</div>
        )}

        {topTags.length > 0 && (
          <div className="profile-tags">
            {topTags.map(([tag, count]) => (
              <span key={tag} className="profile-tag">
                {HOST_TAG_LABELS[tag]} ×{count}
              </span>
            ))}
          </div>
        )}

      </section>

      {profile.upcoming.length > 0 && (
        <>
          <h3 className="who-block-heading">Hosting soon</h3>
          <div className="profile-list">
            {profile.upcoming.map((p) => (
              <Link key={p.id} to={`/plans/${p.id}`} className="profile-list-row">
                <span className="profile-list-emoji">{p.hostEmoji}</span>
                <span className="profile-list-title">{p.title}</span>
                <span className="profile-list-when">{formatPlanDate(p.date)}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {profile.past.length > 0 && (
        <>
          <h3 className="who-block-heading" style={{ marginTop: 18 }}>Past plans</h3>
          <div className="profile-list">
            {profile.past.map((p) => (
              <Link key={p.id} to={`/plans/${p.id}`} className="profile-list-row">
                <span className="profile-list-title">{p.title}</span>
                <span className="profile-list-when">
                  {formatPlanDate(p.date)} · {p.wentCount} went
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
