import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { publicEnv } from "@/lib/env";
import { signInAction, signUpAction } from "@/app/login/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/";

  return (
    <>
      <PageHeading
        eyebrow="Sign in"
        title="Access the Staffer workspace."
        description="Live mode uses Supabase Auth. Demo mode remains open so local walkthroughs keep working before a Supabase project is connected."
      />
      {publicEnv.NEXT_PUBLIC_DEMO_MODE === "true" ? (
        <div className="mb-6 rounded-2xl border border-cyan-400/15 bg-cyan-400/8 p-5 text-sm leading-6 text-slate-300">
          Demo mode is active, so authentication is not required. <Link href="/" className="font-semibold text-cyan-300">Return to command centre.</Link>
        </div>
      ) : null}
      {params.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{params.error}</div> : null}
      {params.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5 text-sm text-emerald-100">{params.message}</div> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <form action={signInAction} className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <input type="hidden" name="next" value={next} />
          <h2 className="font-semibold text-white">Sign in</h2>
          <label className="mt-5 block text-sm text-slate-400">
            Email
            <input name="email" type="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
          </label>
          <label className="mt-4 block text-sm text-slate-400">
            Password
            <input name="password" type="password" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
          </label>
          <button type="submit" className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
            Sign in
          </button>
        </form>
        <form action={signUpAction} className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold text-white">Create founder account</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">After confirming email, the onboarding flow creates the organisation and founder membership.</p>
          <label className="mt-5 block text-sm text-slate-400">
            Email
            <input name="email" type="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
          </label>
          <label className="mt-4 block text-sm text-slate-400">
            Password
            <input name="password" type="password" minLength={8} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
          </label>
          <button type="submit" className="mt-6 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">
            Sign up
          </button>
        </form>
      </div>
    </>
  );
}
