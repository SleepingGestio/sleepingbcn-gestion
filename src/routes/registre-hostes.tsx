import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/registre-hostes")({
  component: RegistreHostesPage,
});

function RegistreHostesPage() {
  return (
    <AppShell title="Registre hostes">
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            En construcció
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
