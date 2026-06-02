import { Preferences } from "@capacitor/preferences";
import { isNative } from "../lib/platform";

const KEY = "commons.authToken";

export async function getAuthToken(): Promise<string | null> {
  if (isNative()) {
    const { value } = await Preferences.get({ key: KEY });
    return value ?? null;
  }
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  if (isNative()) {
    await Preferences.set({ key: KEY, value: token });
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
    await Preferences.remove({ key: KEY });
    return;
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
