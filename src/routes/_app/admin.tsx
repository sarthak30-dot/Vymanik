import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getUser } from "@/lib/auth";
import { requireOperatorRoute } from "@/lib/route-guards";
import {
  Building2, Users, AlertTriangle, CheckCircle2, Clock, Plane,
  ChevronRight, Wifi, WifiOff, Activity, Shield, UserPlus, PlusCircle, KeyRound, Grid3x3,
} from "lucide-react";
import {
  allPlants as seedPlants, teamMembers as seedTeamMembers, reviewQueue,
  type TeamMember, type PlantSummary,
} from "@/lib/mock-data";
import {
  useCreatePlant, useCreateTeamMember, useInviteClient, useGeneratePlantLayout,
  type NewPlantFormInput, type NewTeamMemberFormInput,
} from "@/lib/queries";
import type { NewPlantLayoutInput } from "@/lib/api";
import { toast } from "sonner";

interface ClientAccount {
  name: string;
  email: string;
  plantIds: string[];
  invitedAt: string;
}

export const Route = createFileRoute("/_app/admin")({
  // Admin only — "Control Center" in AppHeader's user menu only shows for admin.
  beforeLoad: () => requireOperatorRoute(["admin"]),
  head: () => ({ meta: [{ title: "Control Center — UrjaScan" }] }),
  component: ControlCenter,
});

// ─── Status badges ─────────────────────────────────────────────────────────

function MemberStatusBadge({ status }: { status: TeamMember["status"] }) {
  const cfg = {
    "On Mission":  { bg: "bg-ochre-muted border-ochre/30", dot: "bg-ochre",   text: "text-ochre-fg" },
    "Active":      { bg: "bg-normal/10 border-normal/30",  dot: "bg-normal",  text: "text-normal" },
    "Off Duty":    { bg: "bg-grey-100 border-grey-200",    dot: "bg-grey-400", text: "text-muted-foreground" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border px-2 py-0.5 ${cfg.bg} ${cfg.text}`}>
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {status}
    </span>
  );
}

function PlantStatusBadge({ status }: { status: PlantSummary["status"] }) {
  const cfg = {
    "Operational":         { bg: "bg-normal/10 border-normal/30", text: "text-normal" },
    "Under Review":        { bg: "bg-ochre-muted border-ochre/30", text: "text-ochre-fg" },
    "Inspection Overdue":  { bg: "bg-critical/10 border-critical/30", text: "text-critical" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border px-2 py-0.5 ${cfg.bg} ${cfg.text}`}>
      {status}
    </span>
  );
}

// ─── Health score pill ──────────────────────────────────────────────────────

function HealthPill({ score }: { score: number }) {
  const color = score >= 90 ? "text-normal" : score >= 75 ? "text-ochre-fg" : "text-critical";
  return <span className={`mono font-bold text-sm ${color}`}>{score}</span>;
}

// ─── Assign inspector modal ─────────────────────────────────────────────────

function AssignModal({
  plant,
  members,
  onClose,
}: {
  plant: PlantSummary;
  members: TeamMember[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(plant.assignedInspectorId ?? "");
  const available = members.filter(m => m.status !== "Off Duty");

  function handleAssign() {
    const member = members.find(m => m.id === selected);
    toast.success(`${member?.name ?? "Inspector"} assigned to ${plant.name}`, {
      description: "Plant owner and inspector have been notified.",
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-grey-200">
          <p className="font-semibold text-sm">Assign Inspector</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Assigning to: <span className="font-semibold text-foreground">{plant.name}</span>
          </p>
          <div className="space-y-2">
            {available.map(m => (
              <label key={m.id} className={`flex items-center gap-3 p-3 border cursor-pointer transition ${selected === m.id ? "border-ochre bg-ochre-muted" : "border-grey-200 hover:bg-muted"}`}>
                <input
                  type="radio"
                  name="inspector"
                  value={m.id}
                  checked={selected === m.id}
                  onChange={() => setSelected(m.id)}
                  className="accent-ochre"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.droneModel.split("+")[0].trim()}</p>
                </div>
                <MemberStatusBadge status={m.status} />
              </label>
            ))}
          </div>
          <button
            onClick={handleAssign}
            disabled={!selected}
            className="w-full h-9 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Assignment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Form field wrapper (shared by the Add/Invite modals) ──────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-widest text-grey-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

// ─── Add plant modal ────────────────────────────────────────────────────────

function AddPlantModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (input: NewPlantFormInput) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [capacityMW, setCapacityMW] = useState("");
  const [totalPanels, setTotalPanels] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !client || !location || !capacityMW || !totalPanels || !lat || !lng) return;
    onSubmit({
      name, client, location,
      capacityMW: parseFloat(capacityMW),
      totalPanels: parseInt(totalPanels, 10),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card border border-border w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-grey-200">
          <p className="font-semibold text-sm">Add Plant</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <Field label="Plant Name">
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Block 24 Solar Plant" className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <Field label="Client">
            <input required value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Rajpur Renewables" className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <Field label="Location">
            <input required value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Jodhpur, Rajasthan" className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacity (MW)">
              <input required type="number" step="0.1" min="0" value={capacityMW} onChange={e => setCapacityMW(e.target.value)} className="w-full h-9 px-3 border border-border bg-card text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
            </Field>
            <Field label="Total Panels">
              <input required type="number" min="0" value={totalPanels} onChange={e => setTotalPanels(e.target.value)} className="w-full h-9 px-3 border border-border bg-card text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <input required type="number" step="0.0001" value={lat} onChange={e => setLat(e.target.value)} className="w-full h-9 px-3 border border-border bg-card text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
            </Field>
            <Field label="Longitude">
              <input required type="number" step="0.0001" value={lng} onChange={e => setLng(e.target.value)} className="w-full h-9 px-3 border border-border bg-card text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
            </Field>
          </div>
          <button type="submit" disabled={isPending} className="w-full h-9 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {isPending ? "Adding…" : "Add Plant"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Add team member modal ──────────────────────────────────────────────────

function AddTeamMemberModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (input: NewTeamMemberFormInput) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [droneModel, setDroneModel] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) return;
    onSubmit({ name, email, phone, droneModel });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card border border-border w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-grey-200">
          <p className="font-semibold text-sm">Add Team Member</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <Field label="Full Name">
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Nair" className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <Field label="Email">
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@vymanik.com" className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +91 98765 43210" className="w-full h-9 px-3 border border-border bg-card text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <Field label="Drone Model">
            <input value={droneModel} onChange={e => setDroneModel(e.target.value)} placeholder="e.g. DJI Matrice 30T" className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <button type="submit" disabled={isPending} className="w-full h-9 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {isPending ? "Adding…" : "Add Team Member"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Invite client modal ─────────────────────────────────────────────────────

function InviteClientModal({
  plants,
  onClose,
  onSubmit,
  isPending,
}: {
  plants: PlantSummary[];
  onClose: () => void;
  onSubmit: (input: { name: string; email: string; plantIds: string[] }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>([]);

  function toggle(id: string) {
    setSelectedPlantIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || selectedPlantIds.length === 0) return;
    onSubmit({ name, email, plantIds: selectedPlantIds });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card border border-border w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-grey-200">
          <p className="font-semibold text-sm">Invite Client</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <Field label="Client Contact Name">
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rohit Mehta" className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <Field label="Email">
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@client.com" className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-grey-400">Grant Access To Plants</label>
            <div className="mt-1.5 border border-border max-h-40 overflow-y-auto divide-y divide-grey-200">
              {plants.map(p => (
                <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={selectedPlantIds.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-ochre"
                  />
                  <span>{p.name} <span className="text-xs text-muted-foreground">— {p.client}</span></span>
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={isPending || selectedPlantIds.length === 0}
            className="w-full h-9 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Creating login…" : "Create Login & Invite"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Plant layout modal ──────────────────────────────────────────────────────
// Section 1: define a plant's Block -> Inverter -> String structure once,
// instead of every inspection re-typing "tower 3, block 24, inverter 2"
// with inconsistent naming.

function PlantLayoutModal({
  plants,
  onClose,
  onSubmit,
  isPending,
}: {
  plants: PlantSummary[];
  onClose: () => void;
  onSubmit: (input: NewPlantLayoutInput) => void;
  isPending: boolean;
}) {
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [blockCount, setBlockCount] = useState("");
  const [invertersPerBlock, setInvertersPerBlock] = useState("");
  const [stringsPerInverter, setStringsPerInverter] = useState("");
  const [modulesPerString, setModulesPerString] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plantId || !blockCount || !invertersPerBlock || !stringsPerInverter || !modulesPerString) return;
    onSubmit({
      plantId,
      blockCount: parseInt(blockCount, 10),
      invertersPerBlock: parseInt(invertersPerBlock, 10),
      stringsPerInverter: parseInt(stringsPerInverter, 10),
      modulesPerString: parseInt(modulesPerString, 10),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card border border-border w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-grey-200">
          <p className="font-semibold text-sm">Define Plant Layout</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground -mt-1 mb-1">
            Generates the Block → Inverter → String hierarchy once. This becomes the fixed set of dropdown options everywhere else in the portal — no more free-typed location fields.
          </p>
          <Field label="Plant">
            <select required value={plantId} onChange={e => setPlantId(e.target.value)} className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre">
              {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Block Count">
              <input required type="number" min="1" value={blockCount} onChange={e => setBlockCount(e.target.value)} placeholder="e.g. 24" className="w-full h-9 px-3 border border-border bg-card text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
            </Field>
            <Field label="Inverters / Block">
              <input required type="number" min="1" value={invertersPerBlock} onChange={e => setInvertersPerBlock(e.target.value)} placeholder="e.g. 3" className="w-full h-9 px-3 border border-border bg-card text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Strings / Inverter">
              <input required type="number" min="1" value={stringsPerInverter} onChange={e => setStringsPerInverter(e.target.value)} placeholder="e.g. 20" className="w-full h-9 px-3 border border-border bg-card text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
            </Field>
            <Field label="Modules / String">
              <input required type="number" min="1" value={modulesPerString} onChange={e => setModulesPerString(e.target.value)} placeholder="e.g. 20" className="w-full h-9 px-3 border border-border bg-card text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
            </Field>
          </div>
          <button type="submit" disabled={isPending} className="w-full h-9 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {isPending ? "Generating…" : "Generate Layout"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

function ControlCenter() {
  const navigate = useNavigate();
  const user = getUser();
  const [assignPlant, setAssignPlant] = useState<PlantSummary | null>(null);

  const [plants, setPlants] = useState<PlantSummary[]>(seedPlants);
  const [members, setMembers] = useState<TeamMember[]>(seedTeamMembers);
  const [clients, setClients] = useState<ClientAccount[]>([]);

  const [showAddPlant, setShowAddPlant] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showInviteClient, setShowInviteClient] = useState(false);
  const [showPlantLayout, setShowPlantLayout] = useState(false);

  const createPlant = useCreatePlant();
  const createTeamMember = useCreateTeamMember();
  const inviteClient = useInviteClient();
  const generatePlantLayout = useGeneratePlantLayout();

  function handleAddPlant(input: NewPlantFormInput) {
    createPlant.mutate(input, {
      onSuccess: (plant) => {
        setPlants(prev => [plant, ...prev]);
        setShowAddPlant(false);
        toast.success(`${plant.name} added to fleet`, {
          description: "Now visible across the Control Center and client portal.",
        });
      },
      onError: (err: Error) => toast.error(err.message || "Failed to add plant"),
    });
  }

  function handleAddMember(input: NewTeamMemberFormInput) {
    createTeamMember.mutate(input, {
      onSuccess: (member) => {
        setMembers(prev => [member, ...prev]);
        setShowAddMember(false);
        toast.success(`${member.name} added to the team`, {
          description: "They can now be assigned to a plant below.",
        });
      },
      onError: (err: Error) => toast.error(err.message || "Failed to add team member"),
    });
  }

  function handlePlantLayout(input: NewPlantLayoutInput) {
    generatePlantLayout.mutate(input, {
      onSuccess: (result) => {
        setShowPlantLayout(false);
        toast.success("Plant layout generated", {
          description: `${result.blocksCreated} blocks, ${result.invertersCreated} inverters, ${result.stringsCreated} strings. Now available in every location dropdown for this plant.`,
        });
      },
      onError: (err: Error) => toast.error(err.message || "Failed to generate plant layout"),
    });
  }

  function handleInviteClient(input: { name: string; email: string; plantIds: string[] }) {
    inviteClient.mutate(input, {
      onSuccess: (result) => {
        setClients(prev => [
          { name: input.name, email: result.email, plantIds: input.plantIds, invitedAt: "Just now" },
          ...prev,
        ]);
        setShowInviteClient(false);
        toast.success(`Login created for ${input.name}`, {
          description: `${result.email} · Temporary password: ${result.tempPassword} — share this securely; they should change it after first login.`,
          duration: 20000,
        });
      },
      onError: (err: Error) => toast.error(err.message || "Failed to invite client"),
    });
  }

  useEffect(() => {
    if (!user || user.role !== "admin") {
      navigate({ to: "/dashboard" });
    }
  }, []);

  if (!user || user.role !== "admin") return null;

  // Fleet summary numbers
  const totalCritical = plants.reduce((s, p) => s + p.criticalCount, 0);
  const totalPanels = plants.reduce((s, p) => s + p.totalPanels, 0);
  const onMission = members.filter(m => m.status === "On Mission").length;
  const overdueCount = plants.filter(p => p.status === "Inspection Overdue").length;
  const pendingReviews = reviewQueue.filter(j => j.stage === "Ready").length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">

      {/* ── Header ── */}
      <section className="bg-primary text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
        <div className="w-14 h-14 bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
          <Shield size={24} className="text-ochre" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-widest text-white/50 mb-1">Control Center</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Vymanik Aerospace — Operations</h1>
          <p className="text-white/60 mt-1 text-sm">
            Fleet management, inspector assignments, and cross-plant anomaly oversight.
          </p>
        </div>
        {/* Fleet quick-stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10 shrink-0">
          {[
            { label: "Plants", value: plants.length, icon: Building2 },
            { label: "Inspectors", value: members.length, icon: Users },
            { label: "On Mission", value: onMission, icon: Activity },
            { label: "Critical", value: totalCritical, icon: AlertTriangle },
          ].map(s => (
            <div key={s.label} className="bg-white/5 px-4 py-3 text-center">
              <p className="mono text-2xl font-bold text-ochre">{s.value}</p>
              <p className="text-[11px] text-white/50 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Status alerts bar ── */}
      {(overdueCount > 0 || pendingReviews > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {overdueCount > 0 && (
            <div className="bg-critical/5 border border-critical/20 px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-critical shrink-0" />
              <p className="text-sm text-foreground">
                <span className="font-semibold">{overdueCount} plant{overdueCount > 1 ? "s" : ""}</span> with inspection overdue. Assign an inspector immediately.
              </p>
            </div>
          )}
          {pendingReviews > 0 && (
            <div className="bg-ochre-muted border border-ochre/20 px-4 py-3 flex items-center gap-3">
              <Clock size={16} className="text-ochre shrink-0" />
              <p className="text-sm text-foreground">
                <span className="font-semibold">{pendingReviews} job{pendingReviews > 1 ? "s" : ""}</span> ready for analyst sign-off.{" "}
                <Link to="/team" className="text-ochre font-medium hover:underline">Review in Inspector Portal →</Link>
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Team assignments ── */}
      <section className="bg-card border border-border overflow-hidden">
        <header className="px-5 py-4 border-b border-grey-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Users size={14} className="text-ochre" /> Team Members & Assignments
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Current status and plant assignments for all Vymanik Aerospace inspectors.
            </p>
          </div>
          <button
            onClick={() => setShowAddMember(true)}
            className="h-8 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg font-medium text-xs inline-flex items-center gap-1.5 shrink-0"
          >
            <UserPlus size={13} /> Add Team Member
          </button>
        </header>

        {/* Desktop table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-widest text-grey-400 border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Inspector</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Assigned Plant</th>
                <th className="text-left px-4 py-3 font-semibold">Drone</th>
                <th className="text-left px-4 py-3 font-semibold">Inspections</th>
                <th className="text-left px-4 py-3 font-semibold">Last Active</th>
                <th className="text-right px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const plant = m.assignedPlantId ? plants.find(p => p.id === m.assignedPlantId) : null;
                return (
                  <tr key={m.id} className="border-b border-grey-200 hover:bg-grey-25">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {m.initials}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4"><MemberStatusBadge status={m.status} /></td>
                    <td className="px-4 py-4">
                      {plant ? (
                        <div>
                          <p className="font-medium text-sm">{plant.name}</p>
                          <p className="text-xs text-muted-foreground">{plant.client}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground max-w-[160px] truncate">
                      {m.droneModel.split("+")[0].trim()}
                    </td>
                    <td className="px-4 py-4">
                      <p className="mono font-bold text-sm">{m.inspectionsCompleted}</p>
                      <p className="text-[10px] text-muted-foreground">{m.anomaliesFound} anomalies</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground mono">{m.lastActive}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => {
                          const plant = plants.find(p => p.assignedInspectorId === m.id) ?? plants[0];
                          setAssignPlant(plant);
                        }}
                        className="h-7 px-3 border border-grey-200 text-xs font-medium hover:bg-muted"
                      >
                        Reassign
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {members.map(m => {
            const plant = m.assignedPlantId ? plants.find(p => p.id === m.assignedPlantId) : null;
            return (
              <div key={m.id} className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {m.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{m.name}</p>
                    <MemberStatusBadge status={m.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>
                  {plant ? (
                    <p className="text-xs mt-1">→ <span className="font-medium">{plant.name}</span></p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Unassigned</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mono mt-1">
                    {m.inspectionsCompleted} inspections · {m.anomaliesFound} anomalies
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Plant fleet overview ── */}
      <section className="bg-card border border-border overflow-hidden">
        <header className="px-5 py-4 border-b border-grey-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Building2 size={14} className="text-ochre" /> Plant Fleet — {plants.length} Sites · {totalPanels.toLocaleString()} Panels
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click "Assign" to change the inspector for any plant.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowPlantLayout(true)}
              className="h-8 px-3 border border-border bg-card text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"
              title="Define the Block / Inverter / String hierarchy for a plant"
            >
              <Grid3x3 size={13} /> Plant Layout
            </button>
            <button
              onClick={() => setShowAddPlant(true)}
              className="h-8 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg font-medium text-xs inline-flex items-center gap-1.5"
            >
              <PlusCircle size={13} /> Add Plant
            </button>
          </div>
        </header>

        {/* Desktop table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-widest text-grey-400 border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Plant / Client</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Health</th>
                <th className="text-left px-4 py-3 font-semibold">Critical</th>
                <th className="text-left px-4 py-3 font-semibold">Inspector</th>
                <th className="text-left px-4 py-3 font-semibold">Next Inspection</th>
                <th className="text-right px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {plants.map(p => {
                const inspector = p.assignedInspectorId
                  ? members.find(m => m.id === p.assignedInspectorId)
                  : null;
                return (
                  <tr key={p.id} className="border-b border-grey-200 hover:bg-grey-25">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.client} · {p.location} · <span className="mono">{p.capacityMW} MW</span></p>
                    </td>
                    <td className="px-4 py-4"><PlantStatusBadge status={p.status} /></td>
                    <td className="px-4 py-4"><HealthPill score={p.healthScore} /></td>
                    <td className="px-4 py-4">
                      {p.criticalCount > 0
                        ? <span className="mono font-bold text-critical">{p.criticalCount}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      {inspector ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                            {inspector.initials}
                          </div>
                          <span className="text-sm">{inspector.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-critical font-medium">⚠ Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs mono text-muted-foreground">{p.nextInspection}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => setAssignPlant(p)}
                        className="h-7 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg font-medium text-xs"
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {plants.map(p => {
            const inspector = p.assignedInspectorId
              ? members.find(m => m.id === p.assignedInspectorId)
              : null;
            return (
              <div key={p.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.client} · {p.location}</p>
                  </div>
                  <PlantStatusBadge status={p.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Health: <HealthPill score={p.healthScore} /></span>
                  {p.criticalCount > 0 && <span className="text-critical font-semibold">{p.criticalCount} critical</span>}
                  <span className="mono">{p.nextInspection}</span>
                </div>
                <div className="flex items-center justify-between">
                  {inspector ? (
                    <p className="text-xs">Inspector: <span className="font-semibold">{inspector.name}</span></p>
                  ) : (
                    <p className="text-xs text-critical font-medium">⚠ No inspector assigned</p>
                  )}
                  <button
                    onClick={() => setAssignPlant(p)}
                    className="h-7 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg font-medium text-xs"
                  >
                    Assign
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Client accounts ── */}
      <section className="bg-card border border-border overflow-hidden">
        <header className="px-5 py-4 border-b border-grey-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <KeyRound size={14} className="text-ochre" /> Client Accounts
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Invite a client and grant them a login scoped to specific plants.
            </p>
          </div>
          <button
            onClick={() => setShowInviteClient(true)}
            className="h-8 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg font-medium text-xs inline-flex items-center gap-1.5 shrink-0"
          >
            <UserPlus size={13} /> Invite Client
          </button>
        </header>
        {clients.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No clients invited this session yet. Existing client logins are managed in Supabase Auth.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {clients.map(c => (
              <div key={c.email} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {c.plantIds.map(id => plants.find(p => p.id === id)?.name ?? id).join(", ")}
                  </p>
                  <p className="text-[10px] text-muted-foreground mono mt-0.5">Invited {c.invitedAt}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Processing queue summary ── */}
      <section className="bg-card border border-border overflow-hidden">
        <header className="px-5 py-4 border-b border-grey-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Plane size={14} className="text-ochre" /> Active Processing Jobs
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Jobs currently in the TGIS pipeline.</p>
          </div>
          <Link to="/team" className="text-xs font-medium text-ochre hover:underline inline-flex items-center gap-1">
            Full Inspector Portal <ChevronRight size={12} />
          </Link>
        </header>
        <div className="divide-y divide-border">
          {reviewQueue.map(j => (
            <div key={j.uploadId} className="px-5 py-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium text-sm">{j.plant}</p>
                <p className="text-xs text-muted-foreground">{j.client} · Pilot: {j.pilot}</p>
              </div>
              <div className="text-right shrink-0">
                {j.stage === "Ready" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold border border-normal/30 bg-normal/10 text-normal px-2 py-0.5">
                    <CheckCircle2 size={11} /> Ready for Review
                  </span>
                ) : j.stage === "Failed" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold border border-critical/30 bg-critical/10 text-critical px-2 py-0.5">
                    <WifiOff size={11} /> Failed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold border border-grey-200 bg-grey-50 px-2 py-0.5">
                    <Wifi size={11} className="text-ochre" /> {j.stage} · {j.progressPct}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Assign modal */}
      {assignPlant && (
        <AssignModal plant={assignPlant} members={members} onClose={() => setAssignPlant(null)} />
      )}

      {/* Add plant modal */}
      {showAddPlant && (
        <AddPlantModal
          onClose={() => setShowAddPlant(false)}
          onSubmit={handleAddPlant}
          isPending={createPlant.isPending}
        />
      )}

      {/* Add team member modal */}
      {showAddMember && (
        <AddTeamMemberModal
          onClose={() => setShowAddMember(false)}
          onSubmit={handleAddMember}
          isPending={createTeamMember.isPending}
        />
      )}

      {/* Plant layout modal */}
      {showPlantLayout && (
        <PlantLayoutModal
          plants={plants}
          onClose={() => setShowPlantLayout(false)}
          onSubmit={handlePlantLayout}
          isPending={generatePlantLayout.isPending}
        />
      )}

      {/* Invite client modal */}
      {showInviteClient && (
        <InviteClientModal
          plants={plants}
          onClose={() => setShowInviteClient(false)}
          onSubmit={handleInviteClient}
          isPending={inviteClient.isPending}
        />
      )}
    </div>
  );
}
