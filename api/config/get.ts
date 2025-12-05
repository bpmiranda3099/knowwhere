import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies } from "../_lib/cookies";
import { verifySession } from "../_lib/session";
import { getDb } from "../_lib/mongo";
import { decryptConfig } from "../_lib/crypto";
import { ObjectId } from "mongodb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const cookies = parseCookies(req);
  const session = verifySession<{ sub: string }>(cookies["kw_session"]);
  if (!session?.sub) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const db = await getDb();
    const configs = db.collection("Configs");
    const doc = await configs.findOne({ ownerId: new ObjectId(session.sub) });
    if (!doc?.data) {
      res.status(200).json({ config: null });
      return;
    }
    const plain = decryptConfig(doc.data);
    res.status(200).json({ config: plain, updatedAt: doc.updatedAt || null });
  } catch (err) {
    console.error("Config fetch failed", err);
    res.status(500).json({ error: "failed_to_fetch_config" });
  }
}
