"use client";

import { Icons } from "@/components/icons";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-400/20 bg-rose-400/8 p-8">
      <span className="grid size-12 place-items-center rounded-2xl border border-rose-400/20 bg-rose-400/10">
        <Icons.help className="size-5 text-rose-300" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-white">This view could not load.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        Staffer hit a configuration or demo-data problem while rendering this page. The action was not executed.
      </p>
      <p className="mt-4 rounded-xl border border-white/8 bg-black/20 p-4 font-mono text-xs text-slate-400">{error.message}</p>
      <button type="button" onClick={reset} className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
        Try again
      </button>
    </div>
  );
}
