import { Icons } from "@/components/icons";

export default function Loading() {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl border border-blue-400/15 bg-blue-400/10">
          <Icons.activity className="size-5 animate-pulse text-blue-300" />
        </span>
        <div>
          <p className="font-semibold text-white">Loading workspace</p>
          <p className="mt-1 text-sm text-slate-500">Preparing the current Staffer view.</p>
        </div>
      </div>
    </div>
  );
}
