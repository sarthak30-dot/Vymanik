import { Compass, ShieldCheck, Zap, AlertOctagon } from "lucide-react";

/**
 * The prospect-density landing state: three numbers and a way in, before the
 * detailed severity breakdown and financial section below it.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE SEVERITY TILES BELOW
 * -----------------------------------------------------------
 * Dashboard already had a health gauge, a critical/medium/healthy breakdown,
 * and a ₹/day loss band — genuinely the same underlying numbers this renders.
 * What it didn't have was a *first thing a non-technical viewer's eye lands
 * on* that says, in three words each, "how bad is it, what does it cost, and
 * is the site basically fine" — the severity tiles require reading three
 * separate counts and doing the critical-vs-total math yourself to get there.
 * This is that summary, and it is deliberately terser than what follows: a
 * prospect deciding whether to keep scrolling needs the headline, not the
 * breakdown by COA band.
 *
 * `defectCount` is total findings (all severities — COA1 through COA3), which
 * matches the number the rest of the app already uses for "N anomalies
 * detected" (anomalies/index.tsx, equipment audits in mock-data.ts) — a
 * prospect comparing this screen against a PDF report or the anomalies list
 * should see the same figure in all three places, not a re-derived one.
 */
export function ExecutiveOverview({
  defectCount,
  dailyLossKWh,
  dailyLossINR,
  showLoss = true,
  healthScore,
  onStartTour,
}: {
  defectCount: number;
  dailyLossKWh: number;
  dailyLossINR: number;
  /** When false, the Estimated Generation Loss KPI is omitted and the grid
   *  drops to two columns. Defaults true so existing callers are unaffected. */
  showLoss?: boolean;
  healthScore: number;
  onStartTour: () => void;
}) {
  return (
    <section className="bg-primary text-white p-5 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/60">Executive Overview</p>
          <p className="text-white/70 text-sm mt-0.5">
            Your site, at a glance — the full breakdown is below.
          </p>
        </div>
        <button
          onClick={onStartTour}
          className="inline-flex items-center gap-1.5 h-8 px-3 border border-white/25 text-white/90 text-xs font-medium hover:bg-white/10 transition shrink-0"
        >
          <Compass size={13} /> Take the tour
        </button>
      </div>

      <div className={`mt-5 grid grid-cols-1 gap-4 ${showLoss ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div data-tour="kpi-defects" className="flex items-start gap-3">
          <div className="w-9 h-9 bg-white/10 flex items-center justify-center shrink-0">
            <AlertOctagon size={16} className="text-ochre" />
          </div>
          <div>
            <p className="mono text-3xl font-bold leading-none">
              {defectCount.toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-white/70 mt-1.5">Total Defects Found</p>
          </div>
        </div>

        {showLoss && (
          <div data-tour="kpi-loss" className="flex items-start gap-3">
            <div className="w-9 h-9 bg-white/10 flex items-center justify-center shrink-0">
              <Zap size={16} className="text-ochre" />
            </div>
            <div>
              <p className="mono text-3xl font-bold leading-none">
                {dailyLossKWh.toLocaleString("en-IN")}
                <span className="text-base font-normal text-white/60"> kWh/day</span>
              </p>
              <p className="text-xs text-white/70 mt-1.5">
                Estimated Generation Loss{" "}
                <span className="text-white/50">
                  · ≈ ₹ {dailyLossINR.toLocaleString("en-IN")}/day
                </span>
              </p>
            </div>
          </div>
        )}

        <div data-tour="kpi-health" className="flex items-start gap-3">
          <div className="w-9 h-9 bg-white/10 flex items-center justify-center shrink-0">
            <ShieldCheck size={16} className="text-ochre" />
          </div>
          <div>
            <p className="mono text-3xl font-bold leading-none">{healthScore}%</p>
            <p className="text-xs text-white/70 mt-1.5">Site Health Score</p>
          </div>
        </div>
      </div>
    </section>
  );
}
