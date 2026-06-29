import { useState } from "react";
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
};
type Rol = { id_rol: number; nombre: string; acceso_app: string | null };
type PersonaRol = { id_persona: number; id_rol: number; fecha_hasta: string | null };

const CONTRATOS = ["Indefinido", "Temporal", "Autónomo", "Prácticas", "Otro"];

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
        .select("id_persona,nombre,apellidos,codigo,tipo_contrato,telefono,mail,activo,onboarding_completat")
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
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [apellidos, setApellidos] = useState(persona?.apellidos ?? "");
  const [codigo, setCodigo] = useState(persona?.codigo ?? "");
  const [telefono, setTelefono] = useState(persona?.telefono ?? "");
  const [mail, setMail] = useState(persona?.mail ?? "");
  const [tipoContrato, setTipoContrato] = useState<string | null>(persona?.tipo_contrato ?? null);
  const [roleIds, setRoleIds] = useState<Set<number>>(new Set(currentRoleIds));
  const [saving, setSaving] = useState(false);

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
    };
    let id_persona: number;
    if (persona) {
      const { error } = await supabase.from("personal").update(payload).eq("id_persona", persona.id_persona);
      if (error) { toast.error("Error: " + error.message); return null; }
      id_persona = persona.id_persona;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("personal")
        .insert({ ...payload, activo: true, fecha_alta: today })
        .select("id_persona")
        .single();
      if (error) { toast.error("Error: " + error.message); return null; }
      id_persona = (data as { id_persona: number }).id_persona;
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
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Nombre *"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Apellidos"><Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} /></Field>
          <Field label="Código"><Input value={codigo} onChange={(e) => setCodigo(e.target.value)} /></Field>
          <Field label="Teléfono"><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={mail} onChange={(e) => setMail(e.target.value)} /></Field>
          <Field label="Tipo de contrato">
            <Select value={tipoContrato ?? "none"} onValueChange={(v) => setTipoContrato(v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {CONTRATOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="col-span-2 space-y-2 pt-2">
            <Label>Roles</Label>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <label key={r.id_rol} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={roleIds.has(r.id_rol)} onCheckedChange={() => toggleRole(r.id_rol)} />
                  <span>{r.nombre}</span>
                </label>
              ))}
              {roles.length === 0 && <span className="text-xs text-muted-foreground">Sin roles definidos</span>}
            </div>
          </div>
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