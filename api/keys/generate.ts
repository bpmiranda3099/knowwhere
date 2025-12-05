import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies } from "../_lib/cookies";
import { verifySession } from "../_lib/session";
import { getDb } from "../_lib/mongo";
import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";

function generateKey() {
  return `kw_${randomBytes(24).toString("hex")}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const cookies = parseCookies(req);
  const session = verifySession<{ sub: string; email?: string }>(cookies["kw_session"]);
  if (!session?.sub) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const db = await getDb();
    const keys = db.collection("SerialKeys");
    const now = new Date();

     // Throttle: only allow a new key every 30 seconds per account to prevent abuse
    const recent = await keys.find({ linkedOAuthAccountId: new ObjectId(session.sub) })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    if (recent.length) {
      const last = recent[0].createdAt ? new Date(recent[0].createdAt) : null;
      if (last && now.getTime() - last.getTime() < 30_000) {
        res.status(429).json({ error: "too_many_requests", message: "Please wait before generating another key." });
        return;
      }
    }

    const apiKey = generateKey();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 180); // 180 days

    await keys.insertOne({
      serialKey: apiKey,
      status: "active",
      linkedOAuthAccountId: new ObjectId(session.sub),
      expiresAt,
      createdAt: now
    });

    res.status(200).json({ apiKey, expiresAt });
  } catch (err) {
    console.error("API key generation failed", err);
    res.status(500).json({ error: "failed_to_generate_key" });
  }
}
