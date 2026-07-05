import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Plus, Mail, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { formatHHMM } from "@/lib/utils";
import { roleColor } from "@/lib/role-colors";

type Persona = {
  id_persona: number;
  nombre: string | null;
  apellidos: string | null;
  codigo: string | null;
  tipo_contrato: string | null;
  telefono: string | null;
  mail: string | null;
  activo: boolean | null;
  onboarding_completat: boolean | null;
  control_horario?: boolean | null;
  horas_objetivo_mes?: number | null;
};
type Rol = { id_rol: number; nombre: string; acceso_app: string | null };
type PersonaRol = { id_persona: number; id_rol: number; fecha_hasta: string | null };

const CONTRATOS: { value: string; label: string }[] = [
  { value: "fijo", label: "Fijo" },
  { value: "discontinuo", label: "Discontinu" },
  { value: "autonomo", label: "Autònom" },
  { value: "temporal", label: "Temporal" },
  { value: "practicas", label: "Pràctiques" },
  { value: "otro", label: "Otro" },
];

const CONTRATO_LABEL: Record<string, string> = Object.fromEntries(
  CONTRATOS.map((c) => [c.value, c.label]),
);

function ContractBadge({ tipo }: { tipo: string | null | undefined }) {
  if (!tipo || !CONTRATO_LABEL[tipo]) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground align-middle">
      {CONTRATO_LABEL[tipo]}
    </span>
  );
}

type PeriodoActividad = {
  id_periodo: number;
  id_persona: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  motivo: string | null;
  horas_objetivo_mes: number | null;
  dies_vacances_any: number | null;
};

function computeVacHours(dies: number, horasMes: number): number {
  return Math.round(dies * (horasMes / 30) * 10) / 10;
}
function oneYearMinusOneDay(iso: string): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
async function insertVacancesAny(args: {
  id_persona: number;
  fecha_inicio: string;
  dies: number;
  horasMes: number;
  creado_por: number | null;
}) {
  const horesCalc = computeVacHours(args.dies, args.horasMes);
  const { error } = await (supabase as any).from("personal_vacances_any").insert({
    id_persona: args.id_persona,
    data_inici_any: args.fecha_inicio,
    data_fi_any: oneYearMinusOneDay(args.fecha_inicio),
    dies_assignats: args.dies,
    hores_calculades: horesCalc,
    hores_assignades: horesCalc,
    creado_por: args.creado_por,
  });
  if (error) throw error;
}

async function sendInvite(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
}

export function PersonalAdmin() {
  const { canEdit: canEditMenu } = usePermissions();
  const canEdit = canEditMenu("config_personal");
  const { isAdmin } = useCurrentPersonal();

  const personalQ = useQuery({
    queryKey: ["personal-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select("id_persona,nombre,apellidos,codigo,tipo_contrato,telefono,mail,activo,onboarding_completat,control_horario,horas_objetivo_mes")
        .order("apellidos", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Persona[];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id_rol, nombre, acceso_app")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Rol[];
    },
  });

  const permisosQ2 = useQuery({
    queryKey: ["rol-permisos-mi-dia"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rol_permisos")
        .select("id_rol, menu, pot_veure")
        .eq("menu", "mi_dia")
        .eq("pot_veure", true);
      if (error) throw error;
      return new Set(((data ?? []) as { id_rol: number }[]).map((r) => r.id_rol));
    },
  });

  const prQ = useQuery({
    queryKey: ["personal-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_roles")
        .select("id_persona, id_rol, fecha_hasta")
        .is("fecha_hasta", null);
      if (error) throw error;
      return (data ?? []) as PersonaRol[];
    },
  });

  const [editing, setEditing] = useState<Persona | null>(null);
  const [creating, setCreating] = useState(false);
  const [deactivateFor, setDeactivateFor] = useState<Persona | null>(null);

  const roleById = (id: number) => rolesQ.data?.find((r) => r.id_rol === id);
  const rolesOf = (id_persona: number): Rol[] =>
    (prQ.data ?? [])
      .filter((x) => x.id_persona === id_persona)
      .map((x) => roleById(x.id_rol))
      .filter((x): x is Rol => !!x);

  async function toggleActivo(p: Persona, activo: boolean) {
    if (!activo) {
      setDeactivateFor(p);
      return;
    }
    const { error } = await supabase.from("personal").update({ activo: true }).eq("id_persona", p.id_persona);
    if (error) { toast.error("Error: " + error.message); return; }
    personalQ.refetch();
  }

  async function confirmDeactivate() {
    if (!deactivateFor) return;
    const { error } = await supabase
      .from("personal")
      .update({ activo: false, mail: null })
      .eq("id_persona", deactivateFor.id_persona);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Persona desactivada i accés revocat");
    setDeactivateFor(null);
    personalQ.refetch();
  }

  async function invite(p: Persona) {
    if (!p.mail) { toast.error("La persona no tiene email"); return; }
    try {
      await sendInvite(p.mail);
      toast.success("Invitación enviada a " + p.mail);
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    }
  }

  async function sendMagicLink(p: Persona) {
    if (!p.mail) return;
    try {
      await sendInvite(p.mail);
      toast.success("Magic link enviat a " + p.mail);
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{personalQ.data?.length ?? 0} personas</p>
        {canEdit && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo usuario
          </Button>
        )}
      </div>
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Rol(s)</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>{isAdmin ? "Compte" : "Acceso app"}</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {personalQ.isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Cargando…</TableCell></TableRow>
            )}
            {!personalQ.isLoading && (personalQ.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sin personal</TableCell></TableRow>
            )}
            {(personalQ.data ?? []).map((p) => {
              const roles = rolesOf(p.id_persona);
              const hasAppRole = roles.length > 0;
              const hasMail = !!(p.mail && p.mail.trim());
              const active = hasAppRole && hasMail;
              const canPreviewAsThis = roles.some((r) => permisosQ2.data?.has(r.id_rol));
              // status: 'sense' | 'pendent' | 'actiu' | 'revocat'
              let status: "sense" | "pendent" | "actiu" | "revocat";
              if (!hasMail) {
                status = "sense";
              } else if (p.onboarding_completat) {
                status = "actiu";
              } else {
                status = "pendent";
              }
              const lastSignIn: string | null = null;
              return (
                <TableRow key={p.id_persona}>
                  <TableCell className="font-medium">
                    {[p.nombre, p.apellidos].filter(Boolean).join(" ") || "—"}
                    <ContractBadge tipo={p.tipo_contrato} />
                  </TableCell>
                  <TableCell>{p.codigo ?? "—"}</TableCell>
                  <TableCell>{p.telefono ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : roles.map((r) => {
                        const s = roleColor(r.nombre);
                        return (
                          <span
                            key={r.id_rol}
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: s.bg, color: s.fg }}
                          >
                            {r.nombre}
                          </span>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    {hasMail ? (
                      <span className="text-sm">{p.mail}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">— Sin email</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <CompteBadge status={status} lastSignIn={lastSignIn} loading={false} />
                    ) : (
                      <div className="inline-flex items-center gap-2 text-xs">
                        <span className={cn("h-2 w-2 rounded-full", active ? "bg-emerald-500" : "bg-slate-400")} />
                        <span>{active ? "Activo" : "Sin acceso"}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={!!p.activo}
                      disabled={!canEdit}
                      onCheckedChange={(v) => toggleActivo(p, v)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && hasMail && !p.onboarding_completat && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Enviar magic link"
                          onClick={() => sendMagicLink(p)}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      )}
                      {canPreviewAsThis && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Ver como trabajador"
                          onClick={() => window.open(`/mi-dia?preview=${p.id_persona}`, "_blank")}
                        >
                          <Eye className="h-4 w-4 text-amber-600" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditing(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {(editing || creating) && (
        <PersonaDialog
          persona={editing}
          roles={rolesQ.data ?? []}
          currentRoleIds={editing ? (prQ.data ?? []).filter((x) => x.id_persona === editing.id_persona).map((x) => x.id_rol) : []}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { personalQ.refetch(); prQ.refetch(); }}
        />
      )}

      <AlertDialog open={!!deactivateFor} onOpenChange={(o) => !o && setDeactivateFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Desactivar {[deactivateFor?.nombre, deactivateFor?.apellidos].filter(Boolean).join(" ") || "persona"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Perdrà l'accés a l'aplicació immediatament.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeactivate}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PersonaDialog({
  persona, roles, currentRoleIds, onClose, onSaved,
}: {
  persona: Persona | null;
  roles: Rol[];
  currentRoleIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { persona: currentUser } = useCurrentPersonal();
  const isEdit = !!persona;
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [apellidos, setApellidos] = useState(persona?.apellidos ?? "");
  const [codigo, setCodigo] = useState(persona?.codigo ?? "");
  const [telefono, setTelefono] = useState(persona?.telefono ?? "");
  const [mail, setMail] = useState(persona?.mail ?? "");
  const [tipoContrato, setTipoContrato] = useState<string | null>(persona?.tipo_contrato ?? null);
  const [controlHorario, setControlHorario] = useState<boolean>(!!persona?.control_horario);
  const [roleIds, setRoleIds] = useState<Set<number>>(new Set(currentRoleIds));
  const [saving, setSaving] = useState(false);

  // Períodes d'activitat (només edit mode)
  const periodosQ = useQuery({
    queryKey: ["personal-periodos", persona?.id_persona],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("personal_periodos_actividad")
        .select("id_periodo, id_persona, fecha_inicio, fecha_fin, motivo, horas_objetivo_mes, dies_vacances_any")
        .eq("id_persona", persona!.id_persona)
        .order("fecha_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PeriodoActividad[];
    },
  });
  const periodos = periodosQ.data ?? [];
  const currentPeriod = periodos.find((p) => !p.fecha_fin) ?? null;

  // Vacances any + consumides per período (edit only)
  const vacancesQ = useQuery({
    queryKey: ["personal-vacances-any-admin", persona?.id_persona],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("personal_vacances_any")
        .select("id_vac_any, data_inici_any, data_fi_any, hores_calculades, hores_assignades")
        .eq("id_persona", persona!.id_persona);
      if (error) throw error;
      return (data ?? []) as Array<{
        id_vac_any: number;
        data_inici_any: string;
        data_fi_any: string;
        hores_calculades: number | null;
        hores_assignades: number | null;
      }>;
    },
  });
  const ajustosVacQ = useQuery({
    queryKey: ["personal-ajustos-vac-admin", persona?.id_persona],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("personal_ajustos_hores")
        .select("fecha, horas")
        .eq("id_persona", persona!.id_persona)
        .eq("tipo", "vacaciones");
      if (error) throw error;
      return (data ?? []) as Array<{ fecha: string; horas: number }>;
    },
  });
  const vacByInici = useMemo(() => {
    const map = new Map<string, { assigned: number; consumed: number }>();
    for (const v of vacancesQ.data ?? []) {
      const assigned = Number(v.hores_calculades ?? v.hores_assignades ?? 0);
      let consumed = 0;
      for (const a of ajustosVacQ.data ?? []) {
        if (a.fecha >= v.data_inici_any && a.fecha <= v.data_fi_any) {
          consumed += Math.abs(Number(a.horas ?? 0));
        }
      }
      map.set(v.data_inici_any, { assigned, consumed });
    }
    return map;
  }, [vacancesQ.data, ajustosVacQ.data]);

  // Període actiu (editable)
  const [periodInicio, setPeriodInicio] = useState<string>("");
  const [periodMotivo, setPeriodMotivo] = useState<string>("");
  const [periodHoras, setPeriodHoras] = useState<string>("");
  const [periodDiesVac, setPeriodDiesVac] = useState<string>("23");
  useEffect(() => {
    if (currentPeriod) {
      setPeriodInicio(currentPeriod.fecha_inicio ?? "");
      setPeriodMotivo(currentPeriod.motivo ?? "");
      setPeriodHoras(
        currentPeriod.horas_objetivo_mes != null ? String(currentPeriod.horas_objetivo_mes) : "",
      );
      setPeriodDiesVac(
        currentPeriod.dies_vacances_any != null ? String(currentPeriod.dies_vacances_any) : "23",
      );
    } else {
      setPeriodInicio("");
      setPeriodMotivo("");
      setPeriodHoras("");
      setPeriodDiesVac("23");
    }
  }, [currentPeriod?.id_periodo]);

  // Create mode: primera alta
  const todayStr = new Date().toISOString().slice(0, 10);
  const [firstFechaInicio, setFirstFechaInicio] = useState<string>(todayStr);
  const [firstHoras, setFirstHoras] = useState<string>("");
  const [firstDiesVac, setFirstDiesVac] = useState<string>("23");
  const [firstMotivo, setFirstMotivo] = useState<string>("Alta inicial");

  const [novaAltaOpen, setNovaAltaOpen] = useState(false);
  const [baixaOpen, setBaixaOpen] = useState(false);
  const [editPeriod, setEditPeriod] = useState<PeriodoActividad | null>(null);

  const toggleRole = (id: number) =>
    setRoleIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  async function persist(): Promise<number | null> {
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return null; }
    const payload = {
      nombre: nombre.trim(),
      apellidos: apellidos.trim() || null,
      codigo: codigo.trim() || null,
      telefono: telefono.trim() || null,
      mail: mail.trim() || null,
      tipo_contrato: tipoContrato,
      control_horario: controlHorario,
    };
    let id_persona: number;
    if (persona) {
      const { error } = await supabase.from("personal").update(payload).eq("id_persona", persona.id_persona);
      if (error) { toast.error("Error: " + error.message); return null; }
      id_persona = persona.id_persona;
      // Update current period fields if any
      if (currentPeriod) {
        const periodPayload: Record<string, unknown> = {
          fecha_inicio: periodInicio || currentPeriod.fecha_inicio,
          motivo: periodMotivo.trim() || null,
          horas_objetivo_mes:
            controlHorario && tipoContrato !== "autonomo" && periodHoras.trim() !== ""
              ? Number(periodHoras)
              : null,
          dies_vacances_any:
            periodDiesVac.trim() !== "" ? Number(periodDiesVac) : 23,
        };
        const { error: pErr } = await (supabase as any)
          .from("personal_periodos_actividad")
          .update(periodPayload)
          .eq("id_periodo", currentPeriod.id_periodo);
        if (pErr) { toast.error("Error període: " + pErr.message); return null; }
      }
    } else {
      const today = todayStr;
      if (!firstFechaInicio) {
        toast.error("La data d'alta és obligatòria");
        return null;
      }
      const { data, error } = await supabase
        .from("personal")
        .insert({ ...payload, activo: true, fecha_alta: today })
        .select("id_persona")
        .single();
      if (error) { toast.error("Error: " + error.message); return null; }
      id_persona = (data as { id_persona: number }).id_persona;
      // Insert first period
      const firstPeriodPayload: Record<string, unknown> = {
        id_persona,
        fecha_inicio: firstFechaInicio,
        motivo: firstMotivo.trim() || "Alta inicial",
        horas_objetivo_mes:
          controlHorario && tipoContrato !== "autonomo" && firstHoras.trim() !== ""
            ? Number(firstHoras)
            : null,
        dies_vacances_any:
          firstDiesVac.trim() !== "" ? Number(firstDiesVac) : 23,
        creado_por: currentUser?.id_persona ?? null,
      };
      const { error: pErr } = await (supabase as any)
        .from("personal_periodos_actividad")
        .insert(firstPeriodPayload);
      if (pErr) { toast.error("Error primera alta: " + pErr.message); return null; }
      // Auto-create vacances any row
      if (tipoContrato !== "autonomo") {
        const diesN = firstDiesVac.trim() !== "" ? Number(firstDiesVac) : 23;
        const horasMes = firstHoras.trim() !== "" ? Number(firstHoras) : 0;
        try {
          await insertVacancesAny({
            id_persona,
            fecha_inicio: firstFechaInicio,
            dies: diesN,
            horasMes,
            creado_por: currentUser?.id_persona ?? null,
          });
        } catch (e) {
          toast.error("Error vacances: " + (e as Error).message);
        }
      }
    }
    const current = new Set(currentRoleIds);
    const target = roleIds;
    const toAdd = [...target].filter((x) => !current.has(x));
    const toRemove = [...current].filter((x) => !target.has(x));
    const today = new Date().toISOString().slice(0, 10);
    if (toAdd.length) {
      const rows = toAdd.map((id_rol) => ({ id_persona, id_rol, fecha_desde: today }));
      const { error } = await supabase.from("personal_roles").insert(rows);
      if (error) { toast.error("Error: " + error.message); return null; }
    }
    for (const id_rol of toRemove) {
      const { error } = await supabase
        .from("personal_roles")
        .update({ fecha_hasta: today })
        .eq("id_persona", id_persona)
        .eq("id_rol", id_rol)
        .is("fecha_hasta", null);
      if (error) { toast.error("Error: " + error.message); return null; }
    }
    return id_persona;
  }

  async function saveOnly() {
    setSaving(true);
    const id = await persist();
    setSaving(false);
    if (id == null) return;
    toast.success("Guardado");
    onSaved(); onClose();
  }

  async function saveAndInvite() {
    if (!mail.trim()) { toast.error("Indica un email para enviar la invitación"); return; }
    setSaving(true);
    const id = await persist();
    if (id == null) { setSaving(false); return; }
    try {
      await sendInvite(mail.trim());
      toast.success("Guardado e invitación enviada");
    } catch (e) {
      toast.error("Guardado, pero falló la invitación: " + (e as Error).message);
    }
    setSaving(false);
    onSaved(); onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{persona ? "Editar persona" : "Nuevo usuario"}</DialogTitle>
          <DialogDescription className="sr-only">Datos del personal</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm">
          {/* Dades personals */}
          <section className="space-y-2">
            <SectionTitle>Dades personals</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre *"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
              <Field label="Apellidos"><Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} /></Field>
              <Field label="Código"><Input value={codigo} onChange={(e) => setCodigo(e.target.value)} /></Field>
              <Field label="Teléfono"><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Field>
              <Field label="Email"><Input type="email" value={mail} onChange={(e) => setMail(e.target.value)} /></Field>
            </div>
          </section>

          <hr className="border-border" />

          {/* Contracte */}
          <section className="space-y-2">
            <SectionTitle>{isEdit ? "Contracte" : "Contracte i primera alta"}</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de contrato">
                <Select value={tipoContrato ?? "none"} onValueChange={(v) => setTipoContrato(v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {CONTRATOS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {!isEdit && (
                <>
                  <Field label="Data d'alta *">
                    <Input type="date" value={firstFechaInicio} onChange={(e) => setFirstFechaInicio(e.target.value)} />
                  </Field>
                  {controlHorario && tipoContrato !== "autonomo" && (
                    <Field label="Hores objectiu/mes">
                      <Input type="number" min={0} step="0.5" value={firstHoras} onChange={(e) => setFirstHoras(e.target.value)} />
                    </Field>
                  )}
                  {tipoContrato !== "autonomo" && (
                    <Field label="Dies vacances / any">
                      <Input type="number" min={0} step="0.5" value={firstDiesVac} onChange={(e) => setFirstDiesVac(e.target.value)} />
                    </Field>
                  )}
                  <Field label="Motivo">
                    <Input value={firstMotivo} onChange={(e) => setFirstMotivo(e.target.value)} placeholder="Alta inicial" />
                  </Field>
                </>
              )}
            </div>
          </section>

          {/* Període actiu (edit only) */}
          {isEdit && (
            <>
              <hr className="border-border" />
              <section className="space-y-2">
                <SectionTitle>Període actiu</SectionTitle>
                {periodosQ.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregant…</p>
                ) : currentPeriod ? (
                  <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-emerald-800">Període obert</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditPeriod(currentPeriod)}
                          aria-label="Editar període actiu"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-rose-300 text-rose-700 hover:bg-rose-50"
                          onClick={() => setBaixaOpen(true)}
                        >
                          Donar de baixa
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Fecha inicio">
                        <Input type="date" value={periodInicio} onChange={(e) => setPeriodInicio(e.target.value)} />
                      </Field>
                      <Field label="Motivo alta">
                        <Input value={periodMotivo} onChange={(e) => setPeriodMotivo(e.target.value)} />
                      </Field>
                      <Field label="Hores objectiu/mes">
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={periodHoras}
                          onChange={(e) => setPeriodHoras(e.target.value)}
                        />
                      </Field>
                      <Field label="Dies vacances / any">
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={periodDiesVac}
                          onChange={(e) => setPeriodDiesVac(e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sense període obert. Crea una nova alta a sota.</p>
                )}
              </section>

              {/* Historial */}
              <hr className="border-border" />
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionTitle>Historial de períodes</SectionTitle>
                  <Button type="button" size="sm" variant="outline" onClick={() => setNovaAltaOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Nova alta
                  </Button>
                </div>
                {periodos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Cap període registrat</p>
                ) : (
                  <div className="rounded-md border divide-y">
                    {periodos.map((p) => {
                      const vac = vacByInici.get(p.fecha_inicio);
                      return (
                        <div
                          key={p.id_periodo}
                          className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-3 px-3 py-2 text-xs"
                        >
                          <div>
                            <span className="font-medium">{p.fecha_inicio}</span>
                            <span className="text-muted-foreground"> → {p.fecha_fin ?? "obert"}</span>
                          </div>
                          <div className="text-muted-foreground truncate">{p.motivo ?? "—"}</div>
                          <div className="text-right tabular-nums">
                            {p.horas_objetivo_mes != null
                              ? `${formatHHMM(Number(p.horas_objetivo_mes))} h/mes`
                              : "—"}
                          </div>
                          <div
                            className="text-muted-foreground tabular-nums text-right"
                            style={{ fontSize: 11 }}
                          >
                            {vac
                              ? `Vac: ${formatHHMM(vac.assigned)} / ${formatHHMM(vac.consumed)}`
                              : ""}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditPeriod(p)}
                            aria-label="Editar període"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          <hr className="border-border" />

          {/* Control horari */}
          <section className="space-y-2">
            <SectionTitle>Control horari</SectionTitle>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <Label className="text-sm">Inclou al registre horari</Label>
                <p className="text-xs text-muted-foreground">Apareix al dashboard de Registre horari</p>
              </div>
              <Switch checked={controlHorario} onCheckedChange={setControlHorario} />
            </div>
          </section>

          <hr className="border-border" />

          {/* Rols */}
          <section className="space-y-2">
            <SectionTitle>Rols</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <label key={r.id_rol} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={roleIds.has(r.id_rol)} onCheckedChange={() => toggleRole(r.id_rol)} />
                  <span>{r.nombre}</span>
                </label>
              ))}
              {roles.length === 0 && <span className="text-xs text-muted-foreground">Sin roles definidos</span>}
            </div>
          </section>
        </div>
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          {!persona ? (
            <>
              <Button variant="secondary" onClick={saveOnly} disabled={saving}>
                {saving ? "Guardando…" : "Crear sin acceso"}
              </Button>
              <Button onClick={saveAndInvite} disabled={saving}>
                {saving ? "Guardando…" : "Crear y enviar invitación"}
              </Button>
            </>
          ) : (
            <Button onClick={saveOnly} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          )}
        </DialogFooter>
        {isEdit && novaAltaOpen && (
          <NovaAltaDialog
            idPersona={persona!.id_persona}
            creadoPor={currentUser?.id_persona ?? null}
            onClose={() => setNovaAltaOpen(false)}
            onSaved={() => { setNovaAltaOpen(false); periodosQ.refetch(); }}
          />
        )}
        {isEdit && baixaOpen && (
          <BaixaDialog
            persona={persona!}
            currentPeriod={currentPeriod}
            onClose={() => setBaixaOpen(false)}
            onSaved={() => { setBaixaOpen(false); periodosQ.refetch(); onSaved(); }}
          />
        )}
        {isEdit && editPeriod && (
          <PeriodEditDialog
            period={editPeriod}
            onClose={() => setEditPeriod(null)}
            onSaved={() => { setEditPeriod(null); periodosQ.refetch(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function NovaAltaDialog({
  idPersona, creadoPor, onClose, onSaved,
}: {
  idPersona: number;
  creadoPor: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(today);
  const [motivo, setMotivo] = useState("Alta");
  const [horas, setHoras] = useState("");
  const [diesVac, setDiesVac] = useState("23");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!fecha) { toast.error("La data és obligatòria"); return; }
    setSaving(true);
    const diesN = diesVac.trim() !== "" ? Number(diesVac) : 23;
    const horasN = horas.trim() !== "" ? Number(horas) : null;
    const { error } = await (supabase as any)
      .from("personal_periodos_actividad")
      .insert({
        id_persona: idPersona,
        fecha_inicio: fecha,
        motivo: motivo.trim() || "Alta",
        horas_objetivo_mes: horasN,
        dies_vacances_any: diesN,
        creado_por: creadoPor,
      });
    if (error) { setSaving(false); toast.error("Error: " + error.message); return; }
    try {
      await insertVacancesAny({
        id_persona: idPersona,
        fecha_inicio: fecha,
        dies: diesN,
        horasMes: horasN ?? 0,
        creado_por: creadoPor,
      });
    } catch (e) {
      setSaving(false);
      toast.error("Error vacances: " + (e as Error).message);
      return;
    }
    setSaving(false);
    toast.success("Nova alta creada");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova alta</DialogTitle>
          <DialogDescription className="sr-only">Afegir un nou període d'activitat</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <Field label="Fecha inicio *"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
          <Field label="Hores objectiu/mes"><Input type="number" min={0} step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} /></Field>
          <Field label="Dies vacances / any"><Input type="number" min={0} step="0.5" value={diesVac} onChange={(e) => setDiesVac(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel·lar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardant…" : "Crear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BaixaDialog({
  persona, currentPeriod, onClose, onSaved,
}: {
  persona: Persona;
  currentPeriod: PeriodoActividad | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(today);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!fecha) { toast.error("La data és obligatòria"); return; }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("personal")
      .update({ fecha_baja: fecha, motivo_baja: motivo.trim() || null })
      .eq("id_persona", persona.id_persona);
    if (error) { setSaving(false); toast.error("Error: " + error.message); return; }
    if (currentPeriod) {
      const { error: pErr } = await (supabase as any)
        .from("personal_periodos_actividad")
        .update({ fecha_fin: fecha, motivo: motivo.trim() || null })
        .eq("id_periodo", currentPeriod.id_periodo);
      if (pErr) { setSaving(false); toast.error("Error període: " + pErr.message); return; }
    }
    setSaving(false);
    toast.success("Baixa registrada");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Donar de baixa</DialogTitle>
          <DialogDescription>Es tancarà el període actiu i s'establirà la data de baixa.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <Field label="Fecha baja *"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Motivo baja *">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motiu de la baixa" />
            {motivo.trim() === "" && <p className="text-xs text-rose-600 mt-1">El motiu és obligatori</p>}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel·lar</Button>
          <Button variant="destructive" onClick={save} disabled={saving || !motivo.trim()}>{saving ? "Guardant…" : "Confirmar baixa"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function PeriodEditDialog({
  period, onClose, onSaved,
}: {
  period: PeriodoActividad;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fechaInicio, setFechaInicio] = useState(period.fecha_inicio ?? "");
  const [fechaFin, setFechaFin] = useState(period.fecha_fin ?? "");
  const [motivo, setMotivo] = useState(period.motivo ?? "");
  const [horas, setHoras] = useState(
    period.horas_objetivo_mes != null ? String(period.horas_objetivo_mes) : "",
  );
  const [diesVac, setDiesVac] = useState(
    period.dies_vacances_any != null ? String(period.dies_vacances_any) : "23",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!fechaInicio) { toast.error("La data d'inici és obligatòria"); return; }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("personal_periodos_actividad")
      .update({
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin.trim() ? fechaFin : null,
        motivo: motivo.trim() || null,
        horas_objetivo_mes: horas.trim() !== "" ? Number(horas) : null,
        dies_vacances_any: diesVac.trim() !== "" ? Number(diesVac) : 23,
      })
      .eq("id_periodo", period.id_periodo);
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Període actualitzat");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar període</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <Field label="Fecha inicio *">
            <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </Field>
          <Field label="Fecha fin">
            <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </Field>
          <Field label="Motivo">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <Field label="Hores objectiu/mes">
            <Input type="number" min={0} step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} />
          </Field>
          <Field label="Dies vacances / any">
            <Input type="number" min={0} step="0.5" value={diesVac} onChange={(e) => setDiesVac(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel·lar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardant…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompteBadge({
  status,
  lastSignIn,
  loading,
}: {
  status: "sense" | "pendent" | "actiu" | "revocat";
  lastSignIn: string | null;
  loading: boolean;
}) {
  if (loading) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  const cfg = {
    sense: { dot: "bg-slate-400", text: "Sense compte", cls: "text-slate-600" },
    pendent: { dot: "bg-amber-500", text: "Pendent", cls: "text-amber-700" },
    actiu: { dot: "bg-emerald-500", text: lastSignIn ? `Actiu · ${lastSignIn}` : "Actiu", cls: "text-emerald-700" },
    revocat: { dot: "bg-rose-500", text: "Revocat", cls: "text-rose-700" },
  }[status];
  return (
    <div className={cn("inline-flex items-center gap-2 text-xs font-medium", cfg.cls)}>
      <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
      <span>{cfg.text}</span>
    </div>
  );
}