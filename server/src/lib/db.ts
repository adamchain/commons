import mongoose from "mongoose";

export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.warn("[db] MONGODB_URI not set — users live in data.json only");
    return;
  }
  try {
    await mongoose.connect(uri);
    console.log("[db] MongoDB connected");
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err ? (err as { code?: number }).code : undefined;
    const isAuth = code === 8000 || (err instanceof Error && /authentication failed/i.test(err.message));
    if (isAuth) {
      console.error(
        "[db] MongoDB authentication failed (Atlas code 8000).\n" +
          "  • In Atlas: Database Access → confirm user/password; Network Access → allow your IP.\n" +
          "  • In server/.env: URL-encode special characters in the password (@ → %40, etc.).\n" +
          "  • Local dev without Atlas: remove or comment out MONGODB_URI (uses server/data.json).",
      );
    }
    throw err;
  }
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
