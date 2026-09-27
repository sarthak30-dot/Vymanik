import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { TeamMemberDTO } from "../../packages/types/src/index";
import { supabase } from "../_lib/supabase";
import { setCors } from "../_lib/cors";
import { getAuthUser } from "../_lib/auth";
import { toTeamMemberDTO } from "../_lib/mappers";

const TEAM_MEMBER_ROLES: TeamMemberDTO["role"][] = ["Drone Pilot", "Data Processor", "Pilot & Processor", "Supervisor"];

/**
 * Edits an existing team member — added alongside migration 005 so the
 * Control Center can record who's flying vs. processing, and what they're
 * currently assigned to, without having to delete and re-add the person.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  const user = await getAuthUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (user.role !== "admin") return res.status(403).json({ error: "Only admins can edit team members" });

  const { id } = req.query as { id: string };
  const { role, currentTask, assignedPlantId } = (req.body ?? {}) as {
    role?: string; currentTask?: string | null; assignedPlantId?: string | null;
  };

  if (role !== undefined && !TEAM_MEMBER_ROLES.includes(role as TeamMemberDTO["role"])) {
    return res.status(400).json({ error: `role must be one of: ${TEAM_MEMBER_ROLES.join(", ")}` });
  }
  if (role === undefined && currentTask === undefined && assignedPlantId === undefined) {
    return res.status(400).json({ error: "Nothing to update — provide role, currentTask, and/or assignedPlantId" });
  }

  const patch: Record<string, unknown> = {};
  if (role !== undefined) patch.role = role;
  if (currentTask !== undefined) patch.current_task = currentTask;
  if (assignedPlantId !== undefined) patch.assigned_plant_id = assignedPlantId;

  const { data, error } = await supabase
    .from("team_members")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: error?.message ?? "Team member not found" });
  return res.json(toTeamMemberDTO(data));
}
