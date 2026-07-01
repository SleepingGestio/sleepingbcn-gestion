import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/registre-horari/$id")({
  component: DetallPage,
});

function DetallPage() {
  const { id } = Route.useParams();
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <Link to="/registre-horari" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline mb-4">
        <ArrowLeft className="h-4 w-4" /> Tornar
      </Link>
      <h1 className="text-2xl font-semibold mb-2">Detall registre horari</h1>
      <p className="text-muted-foreground">Treballador #{id}</p>
      <p className="text-sm text-muted-foreground mt-6">En construcció.</p>
    </div>
  );
}