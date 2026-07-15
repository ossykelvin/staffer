import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icons } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { getApprovals } from "@/lib/repositories/staffer";

export default async function ApprovalsPage() {
  const approvals = await getApprovals();

  return (
    <>
      <PageHeading
        eyebrow="Approval centre"
        title="Nothing material happens silently."
        description="Review the proposed action, supporting evidence, risk level and requesting agent before allowing execution."
      />
      {approvals.length === 0 ? (
        <EmptyState title="No approvals waiting" description="Protected actions will appear here when live workflows begin requesting decisions." icon={Icons.approvals} />
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <article key={approval.id} className="flex flex-col gap-5 rounded-2xl border border-white/8 bg-white/[0.04] p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-600">{approval.id}</span>
                  <StatusBadge value={approval.risk} />
                </div>
                <h2 className="mt-3 font-semibold text-slate-200">{approval.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Requested by {approval.requester} / {approval.type} / {approval.submitted}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/approvals/${approval.id}`} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/7">
                  Review
                </Link>
                <Link href={`/approvals/${approval.id}`} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400">
                  Decide
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
