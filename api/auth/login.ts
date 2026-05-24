import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, role = "client" } = (req.body ?? {}) as {
    email?: string;
    password?: string;
    otp?: string;
    role?: string;
  };

  if (!email) return res.status(400).json({ error: "Email is required" });

  const token = `demo-${Buffer.from(email).toString("base64")}-${Date.now()}`;
  return res.status(200).json({
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    userId: `user-${email.split("@")[0]}`,
    role,
    plantIds: ["plant-rajpur-1"],
  });
}
