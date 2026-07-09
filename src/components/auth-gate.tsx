import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { usePermissions, ROUTE_TO_MENU } from "@/hooks/use-permissions";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ForcePasswordSetup } from "@/components/force-password-setup";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  return <RoleRouter>{children}</RoleRouter>;
}

function RoleRouter({ children }: { children: ReactNode }) {
  const { persona, notConfigured, loading } = useCurrentPersonal();
  const [pwDone, setPwDone] = useState(false);
  const { canView, isAdmin, onlyMiDia, hasAnyAccess, loading: permLoading } = usePermissions();
  const { signOut } = useAuth();
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Whether the current path is one this user is allowed to view. Computed
  // synchronously in render (not just inside the redirect effect below) so
  // it can also gate {children} — otherwise the protected route component
  // would mount for one render before the effect's redirect kicks in.
  const routeAllowed = useMemo(() => {
    if (isAdmin) return true;
    if (onlyMiDia) return path === "/mi-dia";
    const isConfig = path === "/configuracion" || path.startsWith("/configuracion/");
    if (isConfig) {
      return canView("config_general") || canView("config_personal") || canView("config_apartamentos");
    }
    const match = ROUTE_TO_MENU.find((m) => path === m.route || path.startsWith(m.route + "/"));
    return match ? canView(match.menu) : true;
  }, [isAdmin, onlyMiDia, path, canView]);

  useEffect(() => {
    if (loading || permLoading || routeAllowed) return;
    if (onlyMiDia) {
      router.navigate({ to: "/mi-dia", replace: true });
      return;
    }
    const first = ROUTE_TO_MENU.find((m) => canView(m.menu));
    const target = first?.route ?? "/mi-dia";
    router.navigate({ to: target, replace: true });
  }, [loading, permLoading, routeAllowed, onlyMiDia, router, canView]);

  if (loading || permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }
  if (notConfigured || !hasAnyAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="space-y-3 max-w-sm">
          <p className="text-base font-semibold">Usuario no configurado</p>
          <p className="text-sm text-muted-foreground">
            Tu cuenta no tiene acceso a esta aplicación. Contacta con el administrador.
          </p>
          <Button variant="outline" onClick={() => signOut()}>Cerrar sesión</Button>
        </div>
      </div>
    );
  }
  if (!routeAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }
  const needsPw = persona && persona.onboarding_completat === false;
  return (
    <>
      {children}
      {needsPw && !pwDone && (
        <ForcePasswordSetup idPersona={persona!.id_persona} onDone={() => setPwDone(true)} />
      )}
    </>
  );
}

function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 rounded-md bg-slate-900 text-white px-3 py-1 text-sm font-semibold tracking-tight inline-block">
            SleepingBCN
          </div>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Acceso al panel interno</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <PasswordInput
                id="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}