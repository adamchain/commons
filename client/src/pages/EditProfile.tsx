import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { AVATAR_PRESETS, type MeDTO } from "../types/shared";

export function EditProfilePage() {
  const { userId = "" } = useParams();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  if (!user || user.id !== userId) {
    return <LoadingScreen tagline="Loading profile" />;
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar profile-shell">
      <header className="app-header app-header--minimal">
        <Link to={`/profile/${userId}`} className="detail-back">
          ← Profile
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>Edit profile</h1>
      <p className="brand-tagline" style={{ marginBottom: 20 }}>
        Name, photo, bio, and social links.
      </p>
      <EditProfileForm
        me={user}
        onSaved={(me) => {
          setUser(me);
          navigate(`/profile/${userId}`, { replace: true });
        }}
        onCancel={() => navigate(`/profile/${userId}`)}
      />
    </main>
  );
}

function EditProfileForm({
  me,
  onSaved,
  onCancel,
}: {
  me: MeDTO;
  onSaved: (next: MeDTO) => void;
  onCancel: () => void;
}) {
  const { setUser } = useAuth();
  const [firstName, setFirstName] = useState(me.firstName);
  const [lastName, setLastName] = useState(me.lastName ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [photo, setPhoto] = useState<string | null>(me.avatarPhotoDataUrl ?? null);
  const [avatarParams, setAvatarParams] = useState<string | null>(me.avatarParams ?? null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [instagram, setInstagram] = useState(me.socialLinks?.instagram ?? "");
  const [tiktok, setTiktok] = useState(me.socialLinks?.tiktok ?? "");
  const [discoverable, setDiscoverable] = useState(me.discoverableBySearch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickPhoto(dataUrl: string) {
    setPhoto(dataUrl);
    setAvatarParams(null);
  }
  function pickPreset(params: string) {
    setAvatarParams((cur) => (cur === params ? null : params));
    if (avatarParams !== params) setPhoto(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const next = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          bio: bio.trim(),
          avatarPhotoDataUrl: photo ?? null,
          avatarParams: avatarParams ?? null,
          socialLinks: {
            instagram: instagram.trim().replace(/^@/, ""),
            tiktok: tiktok.trim().replace(/^@/, ""),
          },
        }),
      });
      onSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-edit-panel">
      <label className="form-question">Profile image</label>
      <p className="form-help">Upload a photo or pick a character below — one or the other.</p>

      <div className="profile-edit-photo-row">
        <Avatar
          seed={me.avatarSeed}
          style={me.avatarStyle}
          photoDataUrl={photo ?? undefined}
          params={avatarParams ?? undefined}
          name={firstName.trim() || undefined}
          size="lg"
        />
        <div className="profile-edit-photo-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              if (isNative()) {
                try {
                  const dataUrl = await pickPhotoNative({ maxPx: 512, quality: 0.82 });
                  if (dataUrl) pickPhoto(dataUrl);
                } catch {
                  /* user canceled */
                }
                return;
              }
              fileRef.current?.click();
            }}
          >
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

      <details
        className="profile-preset-disclosure"
        open={presetOpen}
        onToggle={(e) => setPresetOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>Pick an avatar</summary>
        <div className="profile-preset-grid" style={{ marginTop: 10 }}>
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
              <Avatar seed={me.avatarSeed} style="avataaars" params={p.params} size="md" />
            </button>
          ))}
        </div>
      </details>

      <label className="form-question" htmlFor="profile-edit-name" style={{ marginTop: 14 }}>
        First name
      </label>
      <input
        id="profile-edit-name"
        className="onboarding-input"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        maxLength={40}
      />

      <label className="form-question" htmlFor="profile-edit-last" style={{ marginTop: 10 }}>
        Last name
      </label>
      <input
        id="profile-edit-last"
        className="onboarding-input"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        maxLength={40}
      />

      <label className="form-question" htmlFor="profile-edit-bio" style={{ marginTop: 10 }}>
        Bio
      </label>
      <textarea
        id="profile-edit-bio"
        className="onboarding-input profile-edit-bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={160}
        rows={3}
        placeholder="A short line about you…"
      />

      <label className="form-question" style={{ marginTop: 14 }}>
        Socials
      </label>
      <p className="form-help">Optional — shown on your profile for everyone to see.</p>

      <label className="form-question" htmlFor="profile-edit-ig" style={{ marginTop: 10 }}>
        Instagram
      </label>
      <input
        id="profile-edit-ig"
        className="onboarding-input"
        value={instagram}
        placeholder="@yourhandle"
        onChange={(e) => setInstagram(e.target.value)}
        maxLength={40}
      />

      <label className="form-question" htmlFor="profile-edit-tt" style={{ marginTop: 14 }}>
        TikTok
      </label>
      <input
        id="profile-edit-tt"
        className="onboarding-input"
        value={tiktok}
        placeholder="@yourhandle"
        onChange={(e) => setTiktok(e.target.value)}
        maxLength={40}
      />

      <div className="settings-row" style={{ marginTop: 16, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <div className="settings-row-body" style={{ paddingLeft: 0 }}>
          <div className="settings-row-title">Public profile</div>
          <div className="settings-row-sub" style={{ whiteSpace: "normal" }}>
            Let people find you by name in search
          </div>
        </div>
        <label className="pref-toggle">
          <input
            type="checkbox"
            checked={discoverable}
            disabled={busy}
            onChange={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  const next = await api<MeDTO>("/api/auth/me", {
                    method: "PATCH",
                    body: JSON.stringify({ discoverableBySearch: !discoverable }),
                  });
                  setDiscoverable(next.discoverableBySearch);
                  setUser(next);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't update privacy");
                } finally {
                  setBusy(false);
                }
              })();
            }}
            aria-label="Public profile — discoverable in search"
          />
        </label>
      </div>

      {error && <p className="onboarding-error" style={{ marginTop: 8 }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ flex: 1 }}
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          style={{ flex: 2 }}
          disabled={busy || !firstName.trim() || !lastName.trim()}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </section>
  );
}
