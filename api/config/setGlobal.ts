import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../_lib/mongo";
import { encryptConfig } from "../_lib/crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const master = process.env.MASTER_CONFIG_KEY;
  const headerKey = req.headers["x-master-config-key"];
  if (!master || !headerKey || headerKey !== master) {
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
      { type: "global" },
      { $set: { data: encrypted, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    res.status(200).json({ ok: true, updatedAt: now });
  } catch (err) {
    console.error("Global config save failed", err);
    res.status(500).json({ error: "failed_to_save_config" });
  }
}
