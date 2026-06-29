import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { usePermissions, type MenuKey } from "@/hooks/use-permissions";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const needsPassword = (user.user_metadata as { password_set?: boolean } | null)?.password_set !== true;
  const [pwDone, setPwDone] = useState(false);
  if (needsPassword && !pwDone) {
    return (
      <>
        <RoleRouter>{children}</RoleRouter>
        <ForcePasswordSetup onDone={() => setPwDone(true)} />
      </>
    );
  }
  return <RoleRouter>{children}</RoleRouter>;
}

function RoleRouter({ children }: { children: ReactNode }) {
  const { notConfigured, loading } = useCurrentPersonal();
  const { canView, isAdmin, onlyMiDia, hasAnyAccess, loading: permLoading } = usePermissions();
  const { signOut } = useAuth();
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (loading || permLoading) return;
    if (onlyMiDia && path !== "/mi-dia") {
      router.navigate({ to: "/mi-dia", replace: true });
      return;
    }
    if (isAdmin || onlyMiDia) return;
    const ROUTE_TO_MENU: { route: string; menu: MenuKey }[] = [
      { route: "/reservas", menu: "reservas" },
      { route: "/checkins", menu: "checkins" },
      { route: "/limpiezas", menu: "limpiezas_asignadas" },
      { route: "/programacion-limpiezas", menu: "programacion_limpiezas" },
      { route: "/comunicar-tareas", menu: "comunicar_tareas" },
      { route: "/mi-dia", menu: "mi_dia" },
    ];
    const isConfig = path === "/configuracion" || path.startsWith("/configuracion/");
    const allowed =
      isConfig
        ? canView("config_general") || canView("config_personal") || canView("config_apartamentos")
        : (ROUTE_TO_MENU.find((m) => path === m.route || path.startsWith(m.route + "/"))?.menu
            ? canView(ROUTE_TO_MENU.find((m) => path === m.route || path.startsWith(m.route + "/"))!.menu)
            : true);
    if (!allowed) {
      const first = ROUTE_TO_MENU.find((m) => canView(m.menu));
      const target = first?.route ?? "/mi-dia";
      router.navigate({ to: target, replace: true });
    }
  }, [onlyMiDia, loading, path, router, isAdmin, permLoading, canView]);
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
  if (onlyMiDia && path !== "/mi-dia") {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }
  return <>{children}</>;
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
              <Input
                id="password"
                type="password"
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