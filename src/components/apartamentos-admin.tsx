import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatHHMM } from "@/lib/utils";
import { HHMMInput } from "@/components/hhmm-input";
import { CategoriasApartamentoAdmin } from "@/components/tipos-categoria-apartamento-admin";

type Grupo = {
  id_grupo: number;
  nombre: string;
  orden: number | null;
  mostrar_por_defecto: boolean | null;
};

type Categoria = {
  id_categoria: number;
  nombre: string;
  activo: boolean | null;
};

type TipoLicencia = {
  id_tipo_licencia: number;
  nombre: string;
  activo: boolean | null;
};

type Apartamento = {
  id_apt: number;
  nombre: string;
  id_grupo: number;
  camas_fijas: number | null;
  tiene_sofa_cama: boolean | null;
  requiere_limpieza_intermedia: boolean | null;
  orden: number | null;
  activo: boolean;
  notas: string | null;
  id_categoria: number | null;
  id_tipo_licencia: number | null;
  tiempo_estandar_std_sin_sfc: number | null;
  tiempo_estandar_std_con_sfc: number | null;
  tiempo_estandar_extra_cr: number | null;
};

const fiftyDaysAgoISO = new Date(Date.now() - 50 * 86400000).toISOString().slice(0, 10);

type Bucket = "std_sin_sfc" | "std_con_sfc" | "extra_cr";

function bucketKey(tipo: string, sfcMontar: boolean | null): Bucket {
  if (tipo === "intermedia") return "extra_cr";
  return sfcMontar ? "std_con_sfc" : "std_sin_sfc";
}

function diffHours(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!isFinite(da) || !isFinite(db) || db <= da) return null;
  return (db - da) / 3_600_000;
}

export function ApartamentosAdmin() {
  const gruposQ = useQuery({
    queryKey: ["cfg-grupos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grupos_apartamentos")
        .select("id_grupo, nombre, orden, mostrar_por_defecto")
        .order("orden", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Grupo[];
    },
  });

  const aptsQ = useQuery({
    queryKey: ["cfg-apartamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartamentos")
        .select(
          "id_apt,nombre,id_grupo,camas_fijas,tiene_sofa_cama,requiere_limpieza_intermedia,orden,activo,notas,id_categoria,id_tipo_licencia,tiempo_estandar_std_sin_sfc,tiempo_estandar_std_con_sfc,tiempo_estandar_extra_cr",
        )
        .order("orden", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Apartamento[];
    },
  });

  const categoriasQ = useQuery({
    queryKey: ["cfg-categorias-apartamento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_categoria_apartamento")
        .select("id_categoria, nombre, activo, orden")
        .order("orden", { ascending: true })
        .order("nombre", { ascending: true });
      if (error) throw error;
      return (data ?? []) as (Categoria & { orden: number | null })[];
    },
  });

  const tiposLicenciaQ = useQuery({
    queryKey: ["cfg-tipos-licencia-turistica"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_licencia_turistica")
        .select("id_tipo_licencia, nombre, activo")
        .order("nombre", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TipoLicencia[];
    },
  });

  const sinConfigQ = useQuery({
    queryKey: ["cfg-sin-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_apartamentos_sin_configurar").select("*");
      if (error) {
        // view may not exist in all envs — silently ignore
        return [] as Array<Record<string, unknown>>;
      }
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const limpiezas50Q = useQuery({
    queryKey: ["cfg-apartamentos-limpiezas-50", fiftyDaysAgoISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("id_apt, tipo, id_limpieza, iniciada_en, finalizada_en, sfc_montar")
        .eq("estado", "finalizada")
        .gte("fecha_limpieza", fiftyDaysAgoISO);
      if (error) throw error;
      return (data ?? []) as {
        id_apt: number; tipo: string; id_limpieza: number;
        iniciada_en: string | null; finalizada_en: string | null; sfc_montar: boolean | null;
      }[];
    },
  });

  const limpiezasRegistre50Q = useQuery({
    queryKey: ["cfg-apartamentos-limpiezas-registre-50", fiftyDaysAgoISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas_registre")
        .select("id_limpieza, hores")
        .not("fi", "is", null)
        .not("hores", "is", null)
        .gte("inici", `${fiftyDaysAgoISO}T00:00:00`);
      if (error) throw error;
      return (data ?? []) as { id_limpieza: number; hores: number | null }[];
    },
  });

  const sessionHoursByLimpieza50 = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of limpiezasRegistre50Q.data ?? []) {
      m.set(r.id_limpieza, (m.get(r.id_limpieza) ?? 0) + Number(r.hores ?? 0));
    }
    return m;
  }, [limpiezasRegistre50Q.data]);

  const effectiveLimpiezas50 = useMemo(() => {
    const out: { id_apt: number; tipo: string; sfc_montar: boolean | null; hours: number }[] = [];
    for (const l of limpiezas50Q.data ?? []) {
      const sessionHours = sessionHoursByLimpieza50.get(l.id_limpieza);
      const hours = sessionHours != null ? sessionHours : diffHours(l.iniciada_en, l.finalizada_en);
      if (hours == null) continue;
      out.push({ id_apt: l.id_apt, tipo: l.tipo, sfc_montar: l.sfc_montar, hours });
    }
    return out;
  }, [limpiezas50Q.data, sessionHoursByLimpieza50]);

  const aptById = useMemo(() => {
    const m = new Map<number, Apartamento>();
    for (const a of aptsQ.data ?? []) m.set(a.id_apt, a);
    return m;
  }, [aptsQ.data]);

  const categoriaNombreById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of categoriasQ.data ?? []) m.set(c.id_categoria, c.nombre);
    return m;
  }, [categoriasQ.data]);

  const avgByApt = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>();
    for (const l of effectiveLimpiezas50) {
      const apt = aptById.get(l.id_apt);
      if (!apt?.activo) continue;
      const key = `${l.id_apt}:${bucketKey(l.tipo, l.sfc_montar)}`;
      const cur = sums.get(key) ?? { total: 0, count: 0 };
      cur.total += l.hours;
      cur.count += 1;
      sums.set(key, cur);
    }
    const out = new Map<string, number>();
    for (const [k, v] of sums) out.set(k, v.total / v.count);
    return out;
  }, [effectiveLimpiezas50, aptById]);

  const avgByCategoria = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>();
    for (const l of effectiveLimpiezas50) {
      const apt = aptById.get(l.id_apt);
      if (!apt?.activo || apt.id_categoria == null) continue;
      const key = `${apt.id_categoria}:${bucketKey(l.tipo, l.sfc_montar)}`;
      const cur = sums.get(key) ?? { total: 0, count: 0 };
      cur.total += l.hours;
      cur.count += 1;
      sums.set(key, cur);
    }
    const out = new Map<string, number>();
    for (const [k, v] of sums) out.set(k, v.total / v.count);
    return out;
  }, [effectiveLimpiezas50, aptById]);

  const [editingApt, setEditingApt] = useState<Apartamento | null>(null);
  const [editingGrupo, setEditingGrupo] = useState<Grupo | null>(null);
  const [prefillName, setPrefillName] = useState<string | null>(null);

  const aptsByGroup = useMemo(() => {
    const m = new Map<number, Apartamento[]>();
    for (const a of aptsQ.data ?? []) {
      const arr = m.get(a.id_grupo) ?? [];
      arr.push(a);
      m.set(a.id_grupo, arr);
    }
    return m;
  }, [aptsQ.data]);

  const refetchAll = () => {
    aptsQ.refetch();
    gruposQ.refetch();
    sinConfigQ.refetch();
    categoriasQ.refetch();
    tiposLicenciaQ.refetch();
  };

  const sinConfigRows = sinConfigQ.data ?? [];

  return (
    <div className="space-y-4">
      {sinConfigRows.length > 0 && (
        <Card className="bg-orange-50 border-orange-200 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-orange-700 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="text-sm font-semibold text-orange-900">
                Apartamentos detectados en Krossbooking sin configurar ({sinConfigRows.length})
              </div>
              <div className="space-y-1">
                {sinConfigRows.map((row, i) => {
                  const name =
                    (row as any).nombre ?? (row as any).Habitaciones ?? JSON.stringify(row);
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 bg-white/70 border border-orange-200 rounded px-2 py-1"
                    >
                      <span className="text-sm font-mono">{String(name)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPrefillName(String(name));
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Dar de alta
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {(gruposQ.data ?? []).map((g) => {
        const apts = aptsByGroup.get(g.id_grupo) ?? [];
        return (
          <Card key={g.id_grupo} className="bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/60 border-b">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide">{g.nombre}</div>
                <div className="text-[11px] text-muted-foreground">
                  Orden: {g.orden ?? "—"} ·{" "}
                  {g.mostrar_por_defecto ? "Visible por defecto" : "Oculto por defecto"}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditingGrupo(g)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <div className="divide-y">
              {apts.length === 0 && (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  Sin apartamentos en este grupo
                </div>
              )}
              {apts.map((a) => (
                <div key={a.id_apt} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {a.nombre}
                      {!a.activo && (
                        <span className="ml-2 text-[10px] uppercase rounded bg-gray-200 text-gray-600 px-1.5 py-0.5">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {a.camas_fijas ?? 0} pax · orden {a.orden ?? "—"}
                      {a.tiene_sofa_cama ? " · SFC" : ""}
                      {a.requiere_limpieza_intermedia === false ? " · sin intermedia" : ""}
                    </div>
                  </div>
                  {a.id_categoria != null && categoriaNombreById.get(a.id_categoria) && (
                    <span className="shrink-0 text-[10px] uppercase rounded bg-blue-100 text-blue-800 px-2 py-0.5 font-medium">
                      {categoriaNombreById.get(a.id_categoria)}
                    </span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditingApt(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      <div className="space-y-2">
        <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Categorías
        </div>
        <CategoriasApartamentoAdmin />
      </div>

      {(editingApt || prefillName) && (
        <ApartamentoDialog
          apt={editingApt}
          prefillName={prefillName}
          grupos={gruposQ.data ?? []}
          categorias={categoriasQ.data ?? []}
          tiposLicencia={tiposLicenciaQ.data ?? []}
          avgByApt={avgByApt}
          avgByCategoria={avgByCategoria}
          onClose={() => {
            setEditingApt(null);
            setPrefillName(null);
          }}
          onSaved={() => refetchAll()}
        />
      )}

      {editingGrupo && (
        <GrupoDialog
          grupo={editingGrupo}
          onClose={() => setEditingGrupo(null)}
          onSaved={() => refetchAll()}
        />
      )}
    </div>
  );
}

type ApartamentoFormState = Omit<
  Partial<Apartamento>,
  "tiempo_estandar_std_sin_sfc" | "tiempo_estandar_std_con_sfc" | "tiempo_estandar_extra_cr"
> & {
  tiempo_estandar_std_sin_sfc?: string;
  tiempo_estandar_std_con_sfc?: string;
  tiempo_estandar_extra_cr?: string;
};

function ApartamentoDialog({
  apt,
  prefillName,
  grupos,
  categorias,
  tiposLicencia,
  avgByApt,
  avgByCategoria,
  onClose,
  onSaved,
}: {
  apt: Apartamento | null;
  prefillName: string | null;
  grupos: Grupo[];
  categorias: Categoria[];
  tiposLicencia: TipoLicencia[];
  avgByApt: Map<string, number>;
  avgByCategoria: Map<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !apt;
  const [form, setForm] = useState<ApartamentoFormState>(
    apt
      ? {
          ...apt,
          tiempo_estandar_std_sin_sfc: apt.tiempo_estandar_std_sin_sfc != null ? String(apt.tiempo_estandar_std_sin_sfc) : "",
          tiempo_estandar_std_con_sfc: apt.tiempo_estandar_std_con_sfc != null ? String(apt.tiempo_estandar_std_con_sfc) : "",
          tiempo_estandar_extra_cr: apt.tiempo_estandar_extra_cr != null ? String(apt.tiempo_estandar_extra_cr) : "",
        }
      : {
          nombre: prefillName ?? "",
          id_grupo: grupos[0]?.id_grupo,
          camas_fijas: 2,
          tiene_sofa_cama: false,
          requiere_limpieza_intermedia: true,
          orden: 1,
          activo: true,
          notas: "",
          id_categoria: null,
          id_tipo_licencia: null,
          tiempo_estandar_std_sin_sfc: "",
          tiempo_estandar_std_con_sfc: "",
          tiempo_estandar_extra_cr: "",
        },
  );
  const [saving, setSaving] = useState(false);

  const numOrNull = (s: string | undefined): number | null =>
    s == null || s.trim() === "" ? null : Number(s);

  const individualAvgText = (bucket: Bucket): string => {
    if (!apt) return "Sin datos";
    const avg = avgByApt.get(`${apt.id_apt}:${bucket}`);
    return avg != null ? formatHHMM(avg) : "Sin datos";
  };

  const categoriaAvgText = (bucket: Bucket): string => {
    const avg = form.id_categoria != null ? avgByCategoria.get(`${form.id_categoria}:${bucket}`) : undefined;
    return avg != null ? formatHHMM(avg) : "Sin datos";
  };

  const visibleCategorias = useMemo(() => {
    const active = categorias.filter((c) => c.activo);
    if (apt?.id_categoria != null && !active.some((c) => c.id_categoria === apt.id_categoria)) {
      const current = categorias.find((c) => c.id_categoria === apt.id_categoria);
      if (current) return [...active, current];
    }
    return active;
  }, [categorias, apt]);

  const visibleTiposLicencia = useMemo(() => {
    const active = tiposLicencia.filter((t) => t.activo);
    if (apt?.id_tipo_licencia != null && !active.some((t) => t.id_tipo_licencia === apt.id_tipo_licencia)) {
      const current = tiposLicencia.find((t) => t.id_tipo_licencia === apt.id_tipo_licencia);
      if (current) return [...active, current];
    }
    return active;
  }, [tiposLicencia, apt]);

  async function save() {
    setSaving(true);
    try {
      const payload: any = {
        nombre: form.nombre,
        id_grupo: form.id_grupo,
        camas_fijas: form.camas_fijas ?? null,
        tiene_sofa_cama: !!form.tiene_sofa_cama,
        requiere_limpieza_intermedia: form.requiere_limpieza_intermedia ?? true,
        orden: form.orden ?? null,
        activo: !!form.activo,
        notas: form.notas ?? null,
        id_categoria: form.id_categoria ?? null,
        id_tipo_licencia: form.id_tipo_licencia ?? null,
        tiempo_estandar_std_sin_sfc: numOrNull(form.tiempo_estandar_std_sin_sfc),
        tiempo_estandar_std_con_sfc: numOrNull(form.tiempo_estandar_std_con_sfc),
        tiempo_estandar_extra_cr: numOrNull(form.tiempo_estandar_extra_cr),
      };
      if (isNew) {
        const { error } = await supabase.from("apartamentos").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("apartamentos")
          .update(payload)
          .eq("id_apt", apt!.id_apt);
        if (error) throw error;
      }
      toast.success("Apartamento guardado");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuevo apartamento" : "Editar apartamento"}</DialogTitle>
          <DialogDescription className="text-xs">
            El campo <code>nombre</code> debe coincidir exactamente con el campo "Habitaciones" en
            Krossbooking, o las reservas dejarán de cuadrar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Nombre (Krossbooking)</Label>
            <Input
              value={form.nombre ?? ""}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
            {!isNew && (
              <p className="text-[10px] text-orange-700">
                ⚠ Cambiar este nombre puede romper el cruce con reservas existentes.
              </p>
            )}
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Grupo</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.id_grupo ?? ""}
              onChange={(e) => setForm({ ...form, id_grupo: Number(e.target.value) })}
            >
              {grupos.map((g) => (
                <option key={g.id_grupo} value={g.id_grupo}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Camas fijas (pax)</Label>
            <Input
              type="number"
              value={form.camas_fijas ?? ""}
              onChange={(e) =>
                setForm({ ...form, camas_fijas: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orden</Label>
            <Input
              type="number"
              value={form.orden ?? ""}
              onChange={(e) =>
                setForm({ ...form, orden: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          {!!form.activo && (
            <>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Categoría</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.id_categoria ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, id_categoria: e.target.value === "" ? null : Number(e.target.value) })
                  }
                >
                  <option value="">Sin categoría</option>
                  {visibleCategorias.map((c) => (
                    <option key={c.id_categoria} value={c.id_categoria}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Tipo de licencia turística</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.id_tipo_licencia ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, id_tipo_licencia: e.target.value === "" ? null : Number(e.target.value) })
                  }
                >
                  <option value="">Sin tipo de licencia</option>
                  {visibleTiposLicencia.map((t) => (
                    <option key={t.id_tipo_licencia} value={t.id_tipo_licencia}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Tiempo estándar de limpieza</Label>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="text-left font-medium px-2 py-1.5"></th>
                        <th className="text-left font-medium px-2 py-1.5">STD sin SFC</th>
                        {form.tiene_sofa_cama && (
                          <th className="text-left font-medium px-2 py-1.5">STD con SFC</th>
                        )}
                        {form.requiere_limpieza_intermedia !== false && (
                          <th className="text-left font-medium px-2 py-1.5">Extra-CR</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="px-2 py-1.5 text-muted-foreground">Sugerido individual</td>
                        <td className="px-2 py-1.5">{individualAvgText("std_sin_sfc")}</td>
                        {form.tiene_sofa_cama && (
                          <td className="px-2 py-1.5">{individualAvgText("std_con_sfc")}</td>
                        )}
                        {form.requiere_limpieza_intermedia !== false && (
                          <td className="px-2 py-1.5">{individualAvgText("extra_cr")}</td>
                        )}
                      </tr>
                      <tr>
                        <td className="px-2 py-1.5 text-muted-foreground">Sugerido por categoría</td>
                        <td className="px-2 py-1.5">{categoriaAvgText("std_sin_sfc")}</td>
                        {form.tiene_sofa_cama && (
                          <td className="px-2 py-1.5">{categoriaAvgText("std_con_sfc")}</td>
                        )}
                        {form.requiere_limpieza_intermedia !== false && (
                          <td className="px-2 py-1.5">{categoriaAvgText("extra_cr")}</td>
                        )}
                      </tr>
                      <tr>
                        <td className="px-2 py-1.5 text-muted-foreground">Asignado manual</td>
                        <td className="px-2 py-1.5">
                          <HHMMInput
                            className="h-8"
                            value={form.tiempo_estandar_std_sin_sfc ?? ""}
                            onChange={(v) => setForm({ ...form, tiempo_estandar_std_sin_sfc: v })}
                          />
                        </td>
                        {form.tiene_sofa_cama && (
                          <td className="px-2 py-1.5">
                            <HHMMInput
                              className="h-8"
                              value={form.tiempo_estandar_std_con_sfc ?? ""}
                              onChange={(v) => setForm({ ...form, tiempo_estandar_std_con_sfc: v })}
                            />
                          </td>
                        )}
                        {form.requiere_limpieza_intermedia !== false && (
                          <td className="px-2 py-1.5">
                            <HHMMInput
                              className="h-8"
                              value={form.tiempo_estandar_extra_cr ?? ""}
                              onChange={(v) => setForm({ ...form, tiempo_estandar_extra_cr: v })}
                            />
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          <ToggleRow
            label="Tiene sofá cama"
            checked={!!form.tiene_sofa_cama}
            onChange={(v) => setForm({ ...form, tiene_sofa_cama: v })}
          />
          <ToggleRow
            label="Requiere limpieza intermedia"
            checked={form.requiere_limpieza_intermedia !== false}
            onChange={(v) => setForm({ ...form, requiere_limpieza_intermedia: v })}
          />
          <ToggleRow
            label="Activo (visible en Gantt)"
            checked={!!form.activo}
            onChange={(v) => setForm({ ...form, activo: v })}
          />
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Notas</Label>
            <Textarea
              rows={3}
              value={form.notas ?? ""}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrupoDialog({
  grupo,
  onClose,
  onSaved,
}: {
  grupo: Grupo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Grupo>(grupo);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("grupos_apartamentos")
        .update({
          nombre: form.nombre,
          orden: form.orden ?? 0,
          mostrar_por_defecto: !!form.mostrar_por_defecto,
        })
        .eq("id_grupo", grupo.id_grupo);
      if (error) throw error;
      toast.success("Grupo guardado");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar grupo</DialogTitle>
          <DialogDescription className="sr-only">Editar grupo de apartamentos</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orden</Label>
            <Input
              type="number"
              value={form.orden ?? ""}
              onChange={(e) =>
                setForm({ ...form, orden: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          <ToggleRow
            label="Mostrar por defecto en el Gantt"
            checked={!!form.mostrar_por_defecto}
            onChange={(v) => setForm({ ...form, mostrar_por_defecto: v })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="col-span-2 flex items-center gap-2 cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-sm">{label}</span>
    </label>
  );
}