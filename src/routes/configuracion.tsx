import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonalAdmin } from "@/components/personal-admin";
import { ApartamentosAdmin } from "@/components/apartamentos-admin";

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
}