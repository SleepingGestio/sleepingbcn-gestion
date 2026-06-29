import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    if (!pw || !confirm) { setError("Ambdós camps són obligatoris"); return; }
    if (pw.length < 8) { setError("La contrasenya ha de tenir almenys 8 caràcters"); return; }
    if (pw !== confirm) { setError("Les contrasenyes no coincideixen"); return; }
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.access_token) {
      setError("La sessió encara no està disponible. Espera un moment i torna a provar.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    if (err) {
      setBusy(false);
      setError(err.message);
      toast.error("Error en establir la contrasenya");
      return;
    }
    const { error: upErr } = await supabase
      .from("personal")
      .update({ onboarding_completat: true })
      .eq("id_persona", idPersona);
    setBusy(false);
    if (upErr) {
      setError(upErr.message);
      toast.error("Contrasenya desada però error en marcar onboarding");
      return;
    }
    toast.success("Contrasenya establerta correctament");
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
          <DialogTitle>Estableix la teva contrasenya</DialogTitle>
          <DialogDescription>
            Per poder accedir des de qualsevol dispositiu, necessites una contrasenya personal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="fps-pw">Nova contrasenya</Label>
            <Input id="fps-pw" type="password" autoComplete="new-password" value={pw}
              onChange={(e) => setPw(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fps-confirm">Confirmar contrasenya</Label>
            <Input id="fps-confirm" type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Desant…" : "Establir contrasenya"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}