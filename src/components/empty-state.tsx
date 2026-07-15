import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Icons } from "@/components/icons";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  icon: Icon = Icons.help,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.025] p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-blue-400/15 bg-blue-400/10">
        <Icon className="size-5 text-blue-300" />
      </span>
      <h2 className="mt-4 font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
