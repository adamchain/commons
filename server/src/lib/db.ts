import mongoose from "mongoose";

export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.warn("[db] MONGODB_URI not set — users live in data.json only");
    return;
  }
  await mongoose.connect(uri);
  console.log("[db] MongoDB connected");
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
