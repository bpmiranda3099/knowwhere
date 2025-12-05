import { randomBytes, createCipheriv, createDecipheriv, createHash } from "crypto";

function getKey() {
  const raw = process.env.CONFIG_ENC_KEY;
  if (!raw) throw new Error("CONFIG_ENC_KEY is not set");
  // Accept hex, base64, or raw string; hash to 32 bytes to normalize
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buf.length === 32) return buf;
  return createHash("sha256").update(buf).digest();
}

export function encryptConfig(plain: string) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptConfig(cipherText: string) {
  const key = getKey();
  const buf = Buffer.from(cipherText, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}
