import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  light = false,
  name = "DropZen",
  logoUrl,
}: {
  className?: string;
  light?: boolean;
  name?: string;
  logoUrl?: string | null;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-8 rounded-lg bg-white object-contain p-0.5" />
      ) : (
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-lg text-white shadow-sm",
          light ? "bg-white/15" : "bg-primary",
        )}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <path
            d="M12 3c4 4.6 7 8 7 12a7 7 0 1 1-14 0c0-4 3-7.4 7-12z"
            fill="currentColor"
          />
        </svg>
      </span>
      )}
      <span className={cn("text-lg font-semibold tracking-tight", light ? "text-white" : "text-foreground")}>
        {name}
      </span>
    </div>
  );
}
