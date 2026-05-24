import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, ArrowRight, Award } from "lucide-react";
import { inspectionHistory, plant } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — UrjaScan" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const [from, setFrom] = useState(inspectionHistory[0].date);
  const [to, setTo] = useState(inspectionHistory[inspectionHistory.length - 1].date);
  const [showCompare, setShowCompare] = useState(false);
  const [reportType, setReportType] = useState("exec");

  const fromI = inspectionHistory.find(i => i.date === from)!;
  const toI = inspectionHistory.find(i => i.date === to)!;
  const resolved = Math.max(0, fromI.critical - toI.critical) + Math.max(0, fromI.medium - toI.medium);
  const newAnom = Math.max(0, toI.critical - fromI.critical) + Math.max(0, toI.medium - fromI.medium);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Inspection Reports — {plant.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">All certified inspections, downloads, and comparisons.</p>
      </header>

      {/* History table */}
      <section className="bg-white border border-grey-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-grey-50 text-[11px] uppercase tracking-widest text-grey-400 border-b border-grey-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-left px-4 py-3 font-semibold">Panels Scanned</th>
                <th className="text-left px-4 py-3 font-semibold">Critical</th>
                <th className="text-left px-4 py-3 font-semibold">Medium</th>
                <th className="text-left px-4 py-3 font-semibold">Normal</th>
                <th className="text-left px-4 py-3 font-semibold">Pilot</th>
                <th className="text-left px-4 py-3 font-semibold">IEC Certified</th>
                <th className="text-right px-4 py-3 font-semibold">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-200">
              {[...inspectionHistory].reverse().map(i => (
                <tr key={i.date} className="hover:bg-grey-25 transition">
                  <td className="px-4 py-3 font-medium">{i.date}</td>
                  <td className="px-4 py-3 mono">{i.panels}</td>
                  <td className="px-4 py-3 mono text-critical font-semibold">{i.critical}</td>
                  <td className="px-4 py-3 mono text-medium font-semibold">{i.medium}</td>
                  <td className="px-4 py-3 mono text-normal font-semibold">{i.normal}</td>
                  <td className="px-4 py-3 text-muted-foreground">{i.pilot}</td>
                  <td className="px-4 py-3">
                    <span className="text-normal text-xs font-medium">IEC 62446-3</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="inline-flex items-center gap-1 text-ochre hover:underline font-medium text-xs">
                      <Download size={12} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Comparison */}
      <section className="bg-white border border-grey-200 p-5 md:p-6">
        <h2 className="font-semibold mb-4 text-sm">Compare Two Inspections</h2>
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="text-[11px] uppercase tracking-widest text-grey-400">From</label>
            <select value={from} onChange={e => setFrom(e.target.value)} className="mt-1.5 w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre">
              {inspectionHistory.map(i => <option key={i.date}>{i.date}</option>)}
            </select>
          </div>
          <ArrowRight className="hidden md:block text-muted-foreground mb-2" size={16} />
          <div className="flex-1">
            <label className="text-[11px] uppercase tracking-widest text-grey-400">To</label>
            <select value={to} onChange={e => setTo(e.target.value)} className="mt-1.5 w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre">
              {inspectionHistory.map(i => <option key={i.date}>{i.date}</option>)}
            </select>
          </div>
          <button onClick={() => setShowCompare(true)} className="h-9 px-5 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm">
            Compare
          </button>
        </div>

        {showCompare && (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-px bg-grey-200 border border-grey-200">
            <CompareCard color="normal" label="Resolved" value={resolved} sub="anomalies fixed" />
            <CompareCard color="critical" label="New Anomalies" value={newAnom} sub="detected" />
            <CompareCard color="medium" label="Net Improvement" value={resolved - newAnom} sub="panels recovered" />
          </div>
        )}
      </section>

      {/* Report types */}
      <section className="bg-white border border-grey-200 p-5 md:p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2 text-sm"><Award size={15} className="text-ochre" /> Generate Report</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { id: "exec", title: "Executive Summary", desc: "1 page, no jargon — for management and stakeholders." },
            { id: "tech", title: "Full Technical Report", desc: "IEC 62446-3 compliant. Includes ΔT tables, GPS data, EL test scope." },
            { id: "warranty", title: "Warranty Claim Package", desc: "Serial numbers, certified ΔT data, IEC stamp — ready for manufacturer." },
          ].map(r => (
            <button
              key={r.id}
              onClick={() => setReportType(r.id)}
              className={`text-left p-4 border-2 transition ${reportType === r.id ? "border-ochre bg-ochre-muted" : "border-grey-200 bg-white hover:border-grey-400"}`}
            >
              <p className="font-semibold text-sm">{r.title}</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{r.desc}</p>
            </button>
          ))}
        </div>
        <button className="mt-4 h-10 px-5 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm inline-flex items-center gap-2">
          <Download size={14} /> Generate {reportType === "exec" ? "Executive Summary" : reportType === "tech" ? "Technical Report" : "Warranty Package"}
        </button>
      </section>
    </div>
  );
}

function CompareCard({ color, label, value, sub }: { color: "critical" | "medium" | "normal"; label: string; value: number; sub: string }) {
  const textColor = {
    critical: "text-critical",
    medium: "text-medium",
    normal: "text-normal",
  }[color];
  const dotColor = {
    critical: "var(--critical)",
    medium: "var(--medium)",
    normal: "var(--normal)",
  }[color];
  return (
    <div className="p-5 bg-white">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <span aria-hidden style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: dotColor, flexShrink: 0 }} />
        {label}
      </p>
      <p className={`mono text-4xl font-bold ${textColor} mt-1`}>{value > 0 ? "+" : ""}{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}
