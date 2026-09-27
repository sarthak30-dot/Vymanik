import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { TeamMemberDTO } from "../packages/types/src/index";
import { supabase } from "./_lib/supabase";
import { setCors } from "./_lib/cors";
import { getAuthUser } from "./_lib/auth";
import { toTeamMemberDTO } from "./_lib/mappers";

const TEAM_MEMBER_ROLES: TeamMemberDTO["role"][] = ["Drone Pilot", "Data Processor", "Pilot & Processor", "Supervisor"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await getAuthUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const { data, error } = await supabase.from("team_members").select("*");
    if (error) return res.status(500).json({ error: error.message });
    return res.json((data ?? []).map(toTeamMemberDTO));
  }

  if (req.method === "POST") {
    if (user.role !== "admin") return res.status(403).json({ error: "Only admins can add team members" });

    const { name, email, phone, droneModel, role, currentTask } = (req.body ?? {}) as {
      name?: string; email?: string; phone?: string; droneModel?: string;
      role?: string; currentTask?: string;
    };
    if (!name || !email) return res.status(400).json({ error: "name and email are required" });
    if (role && !TEAM_MEMBER_ROLES.includes(role as TeamMemberDTO["role"])) {
      return res.status(400).json({ error: `role must be one of: ${TEAM_MEMBER_ROLES.join(", ")}` });
    }

    const id = `tm-${Date.now().toString(36)}`;
    const { data, error } = await supabase
      .from("team_members")
      .insert({
        id, name, email,
        phone: phone ?? null,
        drone_model: droneModel ?? null,
        certifications: [],
        status: "Off Duty",
        // Defaults to 'Drone Pilot' at the DB level (migration 005) when omitted.
        role: role ?? undefined,
        current_task: currentTask ?? null,
        inspections_completed: 0,
        anomalies_found: 0,
        last_active: "Just added",
      })
      .select()
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? "Failed to create team member" });
    return res.status(201).json(toTeamMemberDTO(data));
  }

  return res.status(405).json({ error: "Method not allowed" });
}
