import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies } from "../_lib/cookies";
import { verifySession } from "../_lib/session";
import { getDb } from "../_lib/mongo";
import { encryptConfig } from "../_lib/crypto";
import { ObjectId } from "mongodb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const cookies = parseCookies(req);
  const session = verifySession<{ sub: string }>(cookies["kw_session"]);
  if (!session?.sub) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const { config } = req.body || {};
  if (typeof config !== "string" || !config.trim()) {
    res.status(400).json({ error: "invalid_config" });
    return;
  }

  try {
    const db = await getDb();
    const configs = db.collection("Configs");
    const encrypted = encryptConfig(config);
    const now = new Date();
    await configs.updateOne(
      { ownerId: new ObjectId(session.sub) },
      { $set: { data: encrypted, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    res.status(200).json({ ok: true, updatedAt: now });
  } catch (err) {
    console.error("Config save failed", err);
    res.status(500).json({ error: "failed_to_save_config" });
  }
}
