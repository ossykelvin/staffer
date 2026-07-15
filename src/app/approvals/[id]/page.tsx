import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoDecisionPanel } from "@/components/demo-decision-panel";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { approvals } from "@/lib/data";
import { getApprovalDetail } from "@/lib/demo-details";
import { getApprovalById } from "@/lib/repositories/staffer";
import { stageApprovalDecisionAction } from "@/app/approvals/[id]/actions";

export function generateStaticParams() {
  return approvals.map((approval) => ({ id: approval.id }));
}

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const approval = await getApprovalById(id);

  if (!approval) {
    notFound();
  }

  const detail = getApprovalDetail(approval);

  return (
    <>
      <PageHeading
        eyebrow="Approval review"
        title={approval.title}
        description={detail.summary}
        action={
          <Link href="/approvals" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">
            Back to approvals
          </Link>
        }
      />
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <div className="flex flex-wrap gap-2">
              <StatusBadge value={approval.risk} />
              <StatusBadge value={approval.type} />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Approval ID", approval.id],
                ["Requester", approval.requester],
                ["Submitted", approval.submitted],
                ["Risk", approval.risk],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-600">{label}</p>
                  <p className="mt-2 font-semibold text-slate-200">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Evidence</h2>
            <ul className="mt-4 space-y-3">
              {detail.evidence.map((item) => (
                <li key={item} className="rounded-xl border border-white/8 bg-black/10 p-4 text-sm text-slate-400">{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Exact payload placeholder</h2>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-white/8 bg-black/30 p-4 text-xs leading-6 text-cyan-100">
              {JSON.stringify(detail.payload, null, 2)}
            </pre>
          </div>
        </div>
        <aside className="space-y-6">
          <DemoDecisionPanel approvalId={approval.id} onDecision={stageApprovalDecisionAction} />
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Decision history</h2>
            <div className="mt-4 space-y-3">
              {detail.history.map((event) => (
                <div key={`${event.actor}-${event.event}`} className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <p className="text-sm font-medium text-slate-200">{event.event}</p>
                  <p className="mt-1 text-xs text-slate-500">{event.actor} / {event.when}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}
