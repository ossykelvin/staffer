import { PageHeading } from "@/components/page-heading";
import { createOrganisationAction } from "@/app/onboarding/actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <PageHeading
        eyebrow="Organisation onboarding"
        title="Create the first tenant."
        description="The founder account creates an organisation and receives founder membership through a database RPC so the initial RLS boundary is recorded."
      />
      {params.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{params.error}</div> : null}
      {params.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5 text-sm text-emerald-100">{params.message}</div> : null}
      <form action={createOrganisationAction} className="max-w-3xl rounded-2xl border border-white/8 bg-white/[0.04] p-6">
        <label className="block text-sm text-slate-400">
          Organisation name
          <input name="name" required placeholder="KOP Technology" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
        </label>
        <label className="mt-4 block text-sm text-slate-400">
          Slug
          <input name="slug" placeholder="kop-technology" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
        </label>
        <label className="mt-4 block text-sm text-slate-400">
          Timezone
          <input name="timezone" defaultValue="Europe/London" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
        </label>
        <div className="mt-6 rounded-xl border border-amber-400/15 bg-amber-400/8 p-4 text-sm leading-6 text-slate-400">
          Live onboarding creates one organisation, assigns the current authenticated user as founder, and records an audit event.
        </div>
        <button type="submit" className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
          Create organisation
        </button>
      </form>
    </>
  );
}
