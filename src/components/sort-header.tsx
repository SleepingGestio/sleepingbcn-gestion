import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: React.ReactNode;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 -mx-2 px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span>{label}</span>
      {active ? (
        dir === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-70" />
      )}
    </button>
  );
}