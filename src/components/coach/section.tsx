import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </div>
        )}
        <h2 className="mt-2 font-display text-[26px] font-semibold leading-[1.15] tracking-tight sm:text-[30px]">
          {title}
        </h2>
        {children && (
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{children}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
  action,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("surface p-5 sm:p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h3 className="font-display text-[17px] font-semibold tracking-tight">{title}</h3>
            )}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ScoreBar({ value, className }: { value: number; className?: string }) {
  const tone = value >= 70 ? "bg-success" : value >= 45 ? "bg-primary" : "bg-warning";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-700", tone)}
        style={{ width: `${Math.max(3, value)}%` }}
      />
    </div>
  );
}
