import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";

type Size = "xs" | "sm" | "md";

const SIZE_CLS: Record<Size, string> = {
  xs: "px-1 py-px text-[10px] leading-4",
  sm: "px-1.5 py-0.5 text-[10px] leading-4",
  md: "px-2 py-0.5 text-xs",
};

/**
 * Shared badge used everywhere a cleaning-related time (hora_out / hora_in)
 * is displayed. Emerald when the reservation confirmed/estimated the value
 * (`informed`); grey when we fell back to a default.
 */
export function TimeBadge({
  time,
  value,
  informed,
  size = "sm",
  className,
}: {
  time?: string | null;
  value?: string;
  informed: boolean | null | undefined;
  size?: Size;
  className?: string;
}) {
  const label =
    value !== undefined
      ? value
      : time
        ? fmtTime(time)
        : "—";
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center rounded font-semibold",
        SIZE_CLS[size],
        informed ? "bg-emerald-500 text-white" : "bg-gray-300 text-gray-700",
        className,
      )}
    >
      {label}
    </span>
  );
}