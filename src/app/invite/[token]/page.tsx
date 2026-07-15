import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { acceptInvitationAction } from "@/app/invite/[token]/actions";
import { getCurrentUser, isDemoMode } from "@/lib/auth";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();

  return (
    <>
      <PageHeading
        eyebrow="Organisation invitation"
        title="Join a Staffer workspace."
        description="Invitation acceptance is recorded as a membership change and audit event in the tenant boundary."
      />
      {query.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{query.error}</div> : null}
      <section className="max-w-2xl rounded-2xl border border-white/8 bg-white/[0.04] p-6">
        {user || isDemoMode() ? (
          <form action={acceptInvitationAction}>
            <input type="hidden" name="token" value={token} />
            <p className="text-sm leading-6 text-slate-400">
              Accepting this invitation will create or update your membership for the invited organisation.
            </p>
            <button type="submit" className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
              Accept invitation
            </button>
          </form>
        ) : (
          <div>
            <p className="text-sm leading-6 text-slate-400">You need to sign in or create an account before accepting this invitation.</p>
            <Link href={`/login?next=/invite/${encodeURIComponent(token)}`} className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
              Continue to sign in
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
