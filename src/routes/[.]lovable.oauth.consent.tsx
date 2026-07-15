import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Minimal typed wrapper for the beta supabase.auth.oauth namespace so
// TypeScript compiles without depending on SDK internals.
type OAuthClient = { name?: string; client_uri?: string; redirect_uris?: string[] };
type AuthorizationDetails = {
  client?: OAuthClient;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResp<T> = { data: T | null; error: { message: string } | null };
type SupabaseOAuth = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResp<AuthorizationDetails>>;
  approveAuthorization: (id: string) => Promise<OAuthResp<{ redirect_url?: string; redirect_to?: string }>>;
  denyAuthorization: (id: string) => Promise<OAuthResp<{ redirect_url?: string; redirect_to?: string }>>;
};

function oauth(): SupabaseOAuth {
  return (supabase.auth as unknown as { oauth: SupabaseOAuth }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage,
  // which is absent on the SSR pass.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    // If no session, AuthGate will render the login form at this URL. After
    // sign-in, the same URL re-renders and beforeLoad/loader run again.
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return null; // AuthGate is showing login
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6">
      <p className="text-sm text-destructive">
        No s'ha pogut carregar aquesta petició d'autorització:{" "}
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!details) {
    // AuthGate is showing the login form; nothing to render here.
    return null;
  }

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("El servidor d'autorització no ha retornat cap redirecció.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details.client?.name ?? "aquesta aplicació";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connectar {clientName} al teu compte</CardTitle>
          <CardDescription>
            Permetràs que {clientName} utilitzi les eines de SleepingBCN com si fossis tu.
            Es respecten els permisos i les polítiques del teu compte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {details.scope && (
            <p className="text-xs text-muted-foreground">
              Permisos sol·licitats: <code>{details.scope}</code>
            </p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => decide(true)}>
              {busy ? "Processant…" : "Aprovar"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
              Denegar
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}