import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Preferences } from "@capacitor/preferences";
import { isNative } from "../lib/platform";

const KEY = "commons.authToken";

// iOS Keychain (and Android encrypted storage). Prefix once so the token
// isn't stored under the plugin's default name.
let secureReady: Promise<void> | null = null;
function prepareSecureStorage(): Promise<void> {
  if (!secureReady) {
    secureReady = (async () => {
      await SecureStorage.setSynchronize(false);
      await SecureStorage.setKeyPrefix("commons.");
    })();
  }
  return secureReady;
}

async function readLegacyPreference(): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value ?? null;
  } catch {
    return null;
  }
}

async function getNativeToken(): Promise<string | null> {
  try {
    await prepareSecureStorage();
    const stored = await SecureStorage.get(KEY);
    if (typeof stored === "string" && stored) return stored;
    // Sessions from before Keychain: move them out of UserDefaults once.
    const legacy = await readLegacyPreference();
    if (!legacy) return null;
    await SecureStorage.set(KEY, legacy);
    await Preferences.remove({ key: KEY });
    return legacy;
  } catch {
    return readLegacyPreference();
  }
}

async function setNativeToken(token: string): Promise<void> {
  try {
    await prepareSecureStorage();
    await SecureStorage.set(KEY, token);
    await Preferences.remove({ key: KEY });
    return;
  } catch {
    await Preferences.set({ key: KEY, value: token });
  }
}

async function clearNativeToken(): Promise<void> {
  try {
    await prepareSecureStorage();
    await SecureStorage.remove(KEY);
  } catch {
    /* plugin missing on an older binary */
  }
  try {
    await Preferences.remove({ key: KEY });
  } catch {
    /* ignore */
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (isNative()) return getNativeToken();
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  if (isNative()) {
    await setNativeToken(token);
    return;
  }
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* storage disabled — web cookies still work */
  }
}

export async function clearAuthToken(): Promise<void> {
  if (isNative()) {
    await clearNativeToken();
    return;
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
