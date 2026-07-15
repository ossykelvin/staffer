import { PageHeading } from "@/components/page-heading";
import { updatePasswordAction } from "@/app/account/update-password/actions";

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <PageHeading
        eyebrow="Account security"
        title="Choose a new password."
        description="This page requires a live Supabase session created from a reset link or an existing signed-in account."
      />
      {params.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{params.error}</div> : null}
      <form action={updatePasswordAction} className="max-w-xl rounded-2xl border border-white/8 bg-white/[0.04] p-6">
        <label className="block text-sm text-slate-400">
          New password
          <input name="password" type="password" minLength={8} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
        </label>
        <label className="mt-4 block text-sm text-slate-400">
          Confirm password
          <input name="confirmation" type="password" minLength={8} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
        </label>
        <button type="submit" className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
          Update password
        </button>
      </form>
    </>
  );
}
