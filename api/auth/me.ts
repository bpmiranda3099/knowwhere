import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies } from "../_lib/cookies";
import { verifySession } from "../_lib/session";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = parseCookies(req);
  const session = verifySession<{ sub: string; email?: string }>(cookies["kw_session"]);
  if (!session) {
    res.status(200).json({ loggedIn: false });
    return;
  }
  res.status(200).json({ loggedIn: true, email: session.email || null, accountId: session.sub });
}
