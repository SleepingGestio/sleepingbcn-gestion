import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonalAdmin } from "@/components/personal-admin";
import { ApartamentosAdmin } from "@/components/apartamentos-admin";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/configuracion")({
  component: ConfigPage,
});

function ConfigPage() {
  const { user, signOut } = useAuth();
  return (
    <AppShell title="Configuración">
      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="apartamentos">Apartamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="max-w-2xl space-y-4">
          <Card>
          <CardHeader>
            <CardTitle>Cuenta</CardTitle>
            <CardDescription>Sesión actual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Email: </span>
              <span className="font-medium">{user?.email}</span>
            </div>
            <Button variant="outline" onClick={() => signOut()}>Cerrar sesión</Button>
            <ChangePasswordForm />
          </CardContent>
          </Card>
          <Card>
          <CardHeader>
            <CardTitle>Datos de Krossbooking</CardTitle>
            <CardDescription>Sincronización automática</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Las reservas se importan automáticamente desde Krossbooking en la tabla <code>reservas_kb</code>.
            Esta aplicación no modifica esa tabla; los campos editables se guardan en <code>reservas_gestio</code>.
          </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="personal">
          <PersonalAdmin />
        </TabsContent>
        <TabsContent value="apartamentos">
          <ApartamentosAdmin />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
function ChangePasswordForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  function toggleOpen() {
    if (isOpen) {
      reset();
    }
    setIsOpen((prev) => !prev);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError("Ambos campos son obligatorios");
      return;
    }

    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      toast.error("Error al actualizar la contraseña");
      return;
    }

    toast.success("Contraseña actualizada correctamente");
    reset();
    setIsOpen(false);
  }

  return (
    <div className="pt-2">
      {!isOpen ? (
        <Button variant="secondary" size="sm" onClick={toggleOpen}>
          Cambiar contraseña
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3 rounded-md border p-3">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar contraseña"}
            </Button>
            <Button type="button" variant="outline" onClick={toggleOpen} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}