import { api } from "../api/http";
import { setAuthToken } from "../api/authToken";
import type { MeDTO } from "../types/shared";

/** Move this session onto a personal account or a community sub account. */
export async function switchAccount(userId: string): Promise<MeDTO> {
  const result = await api<MeDTO & { token?: string }>("/api/auth/switch-account", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  const { token, ...me } = result;
  if (token) await setAuthToken(token);
  return me;
}

/** Apply a session the server handed back after transfer or delete. */
export async function applyAccountHandoff(
  result: { token?: string; switchedTo?: MeDTO },
  setUser: (user: MeDTO | null) => void,
): Promise<void> {
  if (result.token) await setAuthToken(result.token);
  if (result.switchedTo) setUser(result.switchedTo);
}
