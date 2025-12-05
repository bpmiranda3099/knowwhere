import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookies, setCookie, clearCookie } from "../_lib/cookies";
import { signSession } from "../_lib/session";
import { getDb } from "../_lib/mongo";

async function exchangeCode(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing Google OAuth env vars");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!resp.ok) {
    throw new Error(`Token exchange failed: ${resp.status}`);
  }
  return resp.json() as Promise<{ id_token: string }>;
}

function decodeIdToken(idToken: string): { sub: string; email?: string; aud?: string } {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid id_token");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  return payload;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const cookies = parseCookies(req);
  const stateCookie = cookies["kw_oauth_state"];
  const stateParam = typeof req.query.state === "string" ? req.query.state : "";
  if (!stateCookie || !stateParam || !stateCookie.startsWith(stateParam)) {
    res.status(400).send("Invalid state");
    return;
  }
  const [, encodedNext] = stateCookie.split("|");
  const next = encodedNext ? decodeURIComponent(encodedNext) : "/api.html";
  clearCookie(res, "kw_oauth_state");

  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    res.status(400).send("Missing code");
    return;
  }

  const host = req.headers.host;
  const protocol = host?.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  try {
    const token = await exchangeCode(code, redirectUri);
    const id = decodeIdToken(token.id_token);
    if (id.aud && id.aud !== process.env.GOOGLE_CLIENT_ID) {
      throw new Error("Audience mismatch");
    }
    if (!id.sub) throw new Error("Missing sub");
    const email = id.email || "";

    const db = await getDb();
    const accounts = db.collection("OAuthAccounts");
    const existing = await accounts.findOne({ provider: "google", providerUserId: id.sub });
    const now = new Date();
    let accountId: string;
    if (existing) {
      accountId = existing._id.toString();
    } else {
      const insert = await accounts.insertOne({
        provider: "google",
        providerUserId: id.sub,
        email,
        createdAt: now
      });
      accountId = insert.insertedId.toString();
    }

    const session = signSession({ sub: accountId, email }, 60 * 60 * 24 * 7);
    setCookie(res, "kw_session", session, { maxAge: 60 * 60 * 24 * 7 });
    res.writeHead(302, { Location: next || "/api.html" });
    res.end();
  } catch (err) {
    console.error("OAuth callback error", err);
    res.status(500).send("OAuth failed");
  }
}
