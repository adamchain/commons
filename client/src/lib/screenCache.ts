/** Last successful payload for a screen, so coming back paints immediately. */
const memory = new Map<string, unknown>();

export function readScreen<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined;
}

export function writeScreen<T>(key: string, value: T): void {
  memory.set(key, value);
}
