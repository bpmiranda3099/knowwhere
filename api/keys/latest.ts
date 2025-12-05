import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies } from "../_lib/cookies";
import { verifySession } from "../_lib/session";
import { getDb } from "../_lib/mongo";
import { ObjectId } from "mongodb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const cookies = parseCookies(req);
  const session = verifySession<{ sub: string; email?: string }>(cookies["kw_session"]);
  if (!session?.sub) {
    res.status(401).json({ loggedIn: false });
    return;
  }

  try {
    const db = await getDb();
    const keys = db.collection("SerialKeys");
    const latest = await keys
      .find({ linkedOAuthAccountId: new ObjectId(session.sub), status: "active" })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (!latest.length) {
      res.status(200).json({ apiKey: null, createdAt: null });
      return;
    }

    res.status(200).json({
      apiKey: latest[0].serialKey || null,
      createdAt: latest[0].createdAt || null
    });
  } catch (err) {
    console.error("Latest key fetch failed", err);
    res.status(500).json({ error: "failed_to_fetch_key" });
  }
}
