import Link from "next/link";
import type { LucideIcon } from "lucide-react";

function MetricCardContent({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: LucideIcon }) {
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-xl border border-blue-400/15 bg-blue-400/10">
          <Icon className="size-5 text-blue-300" />
        </span>
      </div>
      <p className="mt-4 text-xs text-slate-500">{note}</p>
    </>
  );
}

export function MetricCard({
  label,
  value,
  note,
  icon,
  href,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  href?: string;
}) {
  const className =
    "rounded-2xl border border-white/8 bg-white/[0.045] p-5 shadow-2xl shadow-black/5 backdrop-blur transition hover:border-blue-400/25 hover:bg-white/[0.065]";

  if (href) {
    return (
      <Link href={href} className={className}>
        <MetricCardContent label={label} value={value} note={note} icon={icon} />
      </Link>
    );
  }

  return (
    <div className={className}>
      <MetricCardContent label={label} value={value} note={note} icon={icon} />
    </div>
  );
}
