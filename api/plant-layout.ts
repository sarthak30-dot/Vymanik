import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase";
import { setCors } from "./_lib/cors";
import { getAuthUser } from "./_lib/auth";
import { can } from "./_lib/permissions";
import { blockCode, inverterCode, stringCode } from "../packages/types/src/assetHierarchy";

/**
 * Plant layout hierarchy (Section 1): Plant -> Block -> Inverter -> String.
 * GET returns the nested structure for cascading dropdowns (anomaly form,
 * CSV import). POST bulk-generates it once per plant from simple counts so
 * Vymanik doesn't have to click through hundreds of "add block" forms.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await getAuthUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const { plantId } = req.query as { plantId?: string };
    if (!plantId) return res.status(400).json({ error: "plantId is required" });

    const { data: blocks, error: blocksErr } = await supabase
      .from("blocks").select("*").eq("plant_id", plantId).order("code");
    if (blocksErr) return res.status(500).json({ error: blocksErr.message });

    const blockIds = (blocks ?? []).map(b => b.id);
    const { data: inverters, error: invErr } = blockIds.length
      ? await supabase.from("inverters").select("*").in("block_id", blockIds).order("code")
      : { data: [], error: null };
    if (invErr) return res.status(500).json({ error: invErr.message });

    const inverterIds = (inverters ?? []).map(i => i.id);
    const { data: strings, error: strErr } = inverterIds.length
      ? await supabase.from("strings").select("*").in("inverter_id", inverterIds).order("code")
      : { data: [], error: null };
    if (strErr) return res.status(500).json({ error: strErr.message });

    return res.json({
      blocks: (blocks ?? []).map(b => ({ id: b.id, code: b.code })),
      inverters: (inverters ?? []).map(i => ({ id: i.id, blockId: i.block_id, code: i.code })),
      strings: (strings ?? []).map(s => ({ id: s.id, inverterId: s.inverter_id, code: s.code, moduleCount: s.module_count })),
    });
  }

  if (req.method === "POST") {
    if (!can(user.role, "manageLayout")) {
      return res.status(403).json({ error: "Only admins can define plant layout" });
    }

    const { plantId, blockCount, invertersPerBlock, stringsPerInverter, modulesPerString } =
      (req.body ?? {}) as {
        plantId?: string; blockCount?: number; invertersPerBlock?: number;
        stringsPerInverter?: number; modulesPerString?: number;
      };

    if (!plantId || !blockCount || !invertersPerBlock || !stringsPerInverter || !modulesPerString) {
      return res.status(400).json({
        error: "plantId, blockCount, invertersPerBlock, stringsPerInverter and modulesPerString are all required",
      });
    }
    if (blockCount * invertersPerBlock * stringsPerInverter > 5000) {
      return res.status(400).json({ error: "That layout would create more than 5000 strings in one request — split it into multiple smaller layouts" });
    }

    const blockRows = Array.from({ length: blockCount }, (_, i) => ({
      id: `${plantId}-blk-${i + 1}`,
      plant_id: plantId,
      code: blockCode(i + 1),
    }));
    const { data: insertedBlocks, error: blockErr } = await supabase
      .from("blocks").upsert(blockRows, { onConflict: "plant_id,code" }).select();
    if (blockErr) return res.status(500).json({ error: blockErr.message });

    const inverterRows = (insertedBlocks ?? []).flatMap(b =>
      Array.from({ length: invertersPerBlock }, (_, i) => ({
        id: `${b.id}-inv-${i + 1}`,
        block_id: b.id,
        code: inverterCode(i + 1),
      })),
    );
    const { data: insertedInverters, error: invErr } = await supabase
      .from("inverters").upsert(inverterRows, { onConflict: "block_id,code" }).select();
    if (invErr) return res.status(500).json({ error: invErr.message });

    const stringRows = (insertedInverters ?? []).flatMap(inv =>
      Array.from({ length: stringsPerInverter }, (_, i) => ({
        id: `${inv.id}-str-${i + 1}`,
        inverter_id: inv.id,
        code: stringCode(i + 1),
        module_count: modulesPerString,
      })),
    );
    const { error: strErr } = await supabase
      .from("strings").upsert(stringRows, { onConflict: "inverter_id,code" });
    if (strErr) return res.status(500).json({ error: strErr.message });

    return res.status(201).json({
      blocksCreated: insertedBlocks?.length ?? 0,
      invertersCreated: insertedInverters?.length ?? 0,
      stringsCreated: stringRows.length,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
