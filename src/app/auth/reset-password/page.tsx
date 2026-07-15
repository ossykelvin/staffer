import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { requestPasswordResetAction } from "@/app/auth/reset-password/actions";
import { publicEnv } from "@/lib/env";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <PageHeading
        eyebrow="Password reset"
        title="Request a secure reset link."
        description="Supabase sends a one-time recovery link. After confirmation, Staffer opens a protected password update page."
      />
      {publicEnv.NEXT_PUBLIC_DEMO_MODE === "true" ? (
        <div className="mb-6 rounded-2xl border border-cyan-400/15 bg-cyan-400/8 p-5 text-sm leading-6 text-slate-300">
          Demo mode is active, so no reset email will be sent. <Link href="/login" className="font-semibold text-cyan-300">Return to sign in.</Link>
        </div>
      ) : null}
      {params.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{params.error}</div> : null}
      {params.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5 text-sm text-emerald-100">{params.message}</div> : null}
      <form action={requestPasswordResetAction} className="max-w-xl rounded-2xl border border-white/8 bg-white/[0.04] p-6">
        <label className="block text-sm text-slate-400">
          Email
          <input name="email" type="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
        </label>
        <button type="submit" className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
          Send reset link
        </button>
      </form>
    </>
  );
}
