import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ForcePasswordSetup({ onDone, idPersona }: { onDone: () => void; idPersona: number }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session?.access_token) setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!cancelled && session?.access_token) setSessionReady(true);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pw || !confirm) { setError("Ambos campos son obligatorios"); return; }
    if (pw.length < 8) { setError("La contraseña debe tener al menos 8 caracteres"); return; }
    if (pw !== confirm) { setError("Las contraseñas no coinciden"); return; }
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.access_token) {
      setError("La sesión aún no está disponible. Espera un momento y vuelve a intentarlo.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    if (err) {
      setBusy(false);
      setError(err.message);
      toast.error("Error al establecer la contraseña");
      return;
    }
    const { error: upErr } = await supabase.rpc("complete_own_onboarding");
    setBusy(false);
    if (upErr) {
      setError(upErr.message);
      toast.error("Contraseña guardada pero hubo un error al marcar el onboarding");
      return;
    }
    toast.success("Contraseña establecida correctamente");
    onDone();
  }

  if (!sessionReady) return null;
  return (
    <Dialog open>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Establece tu contraseña</DialogTitle>
          <DialogDescription>
            Para poder acceder desde cualquier dispositivo, necesitas una contraseña personal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="fps-pw">Nueva contraseña</Label>
            <PasswordInput id="fps-pw" autoComplete="new-password" value={pw}
              onChange={(e) => setPw(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fps-confirm">Confirmar contraseña</Label>
            <PasswordInput id="fps-confirm" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Guardando…" : "Establecer contraseña"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}