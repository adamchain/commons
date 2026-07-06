import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { AVATAR_PRESETS, type MeDTO } from "../types/shared";

/**
 * Full-page profile editor. Reached from the "Edit profile" button on the
 * profile screen (opens a new page rather than editing inline).
 */
export function EditProfilePage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [photo, setPhoto] = useState<string | null>(user?.avatarPhotoDataUrl ?? null);
  const [avatarParams, setAvatarParams] = useState<string | null>(user?.avatarParams ?? null);
  const [instagram, setInstagram] = useState(user?.socialLinks?.instagram ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return <LoadingScreen tagline="Loading profile" />;

  function pickPhoto(dataUrl: string) {
    setPhoto(dataUrl);
    setAvatarParams(null);
  }
  function pickPreset(params: string) {
    setAvatarParams((cur) => (cur === params ? null : params));
    if (avatarParams !== params) setPhoto(null);
  }

  async function save() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          avatarPhotoDataUrl: photo ?? null,
          avatarParams: avatarParams ?? null,
          socialLinks: { instagram: instagram.trim().replace(/^@/, "") },
        }),
      });
      setUser(next);
      navigate(`/profile/${user.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setBusy(false);
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={`/profile/${user.id}`} className="detail-back">
          ← Profile
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>
        Edit profile
      </h1>

      <section className="profile-edit-panel">
        <label className="form-question" htmlFor="edit-first">
          Your name
        </label>
        <input
          id="edit-first"
          className="onboarding-input"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          maxLength={40}
          placeholder="First name"
        />
        <input
          className="onboarding-input"
          style={{ marginTop: 8 }}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          maxLength={40}
          placeholder="Last name"
        />

        <label className="form-question" style={{ marginTop: 14 }}>
          Profile image
        </label>
        <p className="form-help">Upload a photo or pick a character below — one or the other.</p>

        <div className="profile-edit-photo-row">
          <Avatar
            seed={user.avatarSeed}
            style={user.avatarStyle}
            photoDataUrl={photo ?? undefined}
            params={avatarParams ?? undefined}
            name={firstName.trim() || undefined}
            size="lg"
          />
          <div className="profile-edit-photo-actions">
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
              {photo ? "Replace photo" : "Upload photo"}
            </button>
            {(photo || avatarParams) && (
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setPhoto(null);
                  setAvatarParams(null);
                }}
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                fileToResizedDataUrl(f)
                  .then(pickPhoto)
                  .catch(() => setError("Couldn't read that image. Try another."));
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
          </div>
        </div>

        <p className="profile-emoji-label" style={{ marginTop: 12 }}>Or pick a character</p>
        <div className="profile-preset-grid">
          {AVATAR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`profile-preset-pick ${avatarParams === p.params ? "is-selected" : ""}`}
              onClick={() => pickPreset(p.params)}
              aria-pressed={avatarParams === p.params}
              aria-label={p.label}
              title={p.label}
            >
              <Avatar seed={user.avatarSeed} style="avataaars" params={p.params} size="md" />
            </button>
          ))}
        </div>

        <label className="form-question" htmlFor="edit-ig" style={{ marginTop: 14 }}>
          Instagram
        </label>
        <p className="form-help">
          Only visible to people you’ve actually shown up for — others have to share a completed
          plan with you first.
        </p>
        <input
          id="edit-ig"
          className="onboarding-input"
          value={instagram}
          placeholder="@yourhandle"
          onChange={(e) => setInstagram(e.target.value)}
          maxLength={40}
        />

        {error && <p className="onboarding-error" style={{ marginTop: 8 }}>{error}</p>}

        <button
          type="button"
          className="btn-primary btn-block"
          style={{ marginTop: 16 }}
          disabled={busy || !firstName.trim()}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </section>
    </main>
  );
}
