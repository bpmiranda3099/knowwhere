import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearCookie } from "../_lib/cookies";

export default function handler(req: VercelRequest, res: VercelResponse) {
  clearCookie(res, "kw_session");
  res.writeHead(302, { Location: "/web/index.html" });
  res.end();
}
