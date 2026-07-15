import Link from "next/link";
import { createAgentAction } from "@/app/agents/actions";
import { AgentProfileForm } from "@/components/agent-profile-form";
import { PageHeading } from "@/components/page-heading";

export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <PageHeading
        eyebrow="Agent registry"
        title="Create an agent profile."
        description="Create a tenant-owned draft profile. Live saves create version 1 and record the mutation in the audit trail."
        action={
          <Link href="/agents" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/7">
            Back to staff directory
          </Link>
        }
      />

      {params.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{params.error}</div> : null}
      {params.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5 text-sm text-emerald-100">{params.message}</div> : null}

      <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
        <AgentProfileForm action={createAgentAction} submitLabel="Create draft profile" />
      </section>
    </>
  );
}
