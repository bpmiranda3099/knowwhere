import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../_lib/mongo";
import { decryptConfig } from "../_lib/crypto";
import { ObjectId } from "mongodb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { apiKey } = req.body || {};
  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "missing_api_key" });
    return;
  }

  try {
    const db = await getDb();
    const keys = db.collection("SerialKeys");
    const configs = db.collection("Configs");
    const keyRecord = await keys.findOne({ serialKey: apiKey, status: { $ne: "inactive" } });
    let cfg = null;
    if (keyRecord?.linkedOAuthAccountId) {
      cfg = await configs.findOne({ ownerId: new ObjectId(keyRecord.linkedOAuthAccountId) });
    }
    // Fallback to global config (type = "global") if user-specific is missing
    if (!cfg) {
      cfg = await configs.findOne({ type: "global" });
    }
    if (!cfg?.data) {
      res.status(200).json({ config: null });
      return;
    }
    const plain = decryptConfig(cfg.data);
    res.status(200).json({ config: plain, updatedAt: cfg.updatedAt || null });
  } catch (err) {
    console.error("Config fetch by key failed", err);
    res.status(500).json({ error: "failed_to_fetch_config" });
  }
}
