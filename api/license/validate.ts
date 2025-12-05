import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../_lib/mongo";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { apiKey, machineId } = req.body || {};
  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ ok: false, reason: "missing_api_key" });
    return;
  }

  try {
    const db = await getDb();
    const keys = db.collection("SerialKeys");
    const record = await keys.findOne({ serialKey: apiKey });
    if (!record) {
      res.status(200).json({ ok: false, reason: "not_found" });
      return;
    }
    if (record.status && record.status !== "active") {
      res.status(200).json({ ok: false, reason: "inactive" });
      return;
    }
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      res.status(200).json({ ok: false, reason: "expired" });
      return;
    }

    // Optionally track lastUsed/machineId
    await keys.updateOne(
      { _id: record._id },
      { $set: { lastUsed: new Date(), lastMachineId: machineId || null } }
    );

    res.status(200).json({
      ok: true,
      expiresAt: record.expiresAt || null,
      status: record.status || "active"
    });
  } catch (err) {
    console.error("License validate failed", err);
    res.status(500).json({ ok: false, reason: "server_error" });
  }
}
