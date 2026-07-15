import Link from "next/link";
import { Icons } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-8">
      <span className="grid size-12 place-items-center rounded-2xl border border-blue-400/15 bg-blue-400/10">
        <Icons.help className="size-5 text-blue-300" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-white">Nothing exists at this address.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
        The requested record may not exist in the demo seed data yet, or the live repository for this route has not been connected.
      </p>
      <Link href="/" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
        Return to command centre
      </Link>
    </div>
  );
}
