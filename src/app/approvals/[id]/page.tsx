import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoDecisionPanel } from "@/components/demo-decision-panel";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { approvals } from "@/lib/data";
import { getApprovalDetailById } from "@/lib/repositories/staffer";
import { stageApprovalDecisionAction, verifyApprovalExecutionAction } from "@/app/approvals/[id]/actions";

export function generateStaticParams() {
  return approvals.map((approval) => ({ id: approval.id }));
}

export default async function ApprovalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const [detail, query] = await Promise.all([getApprovalDetailById(id), searchParams]);

  if (!detail) {
    notFound();
  }

  const { approval, policyEvaluation, decisions, executionChecks } = detail;
  const payload = approval.payload ?? {};
  const exactPayload = JSON.stringify(payload, null, 2);

  return (
    <>
      <PageHeading
        eyebrow="Approval review"
        title={approval.title}
        description="Inspect the policy decision, immutable evidence, exact approved payload and execution check before a protected action can proceed."
        action={
          <Link href="/approvals" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">
            Back to approvals
          </Link>
        }
      />
      {query.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{query.error}</div> : null}
      {query.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5 text-sm text-emerald-100">{query.message}</div> : null}
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <div className="flex flex-wrap gap-2">
              <StatusBadge value={approval.risk} />
              <StatusBadge value={approval.type} />
              <StatusBadge value={approval.status ?? "pending"} />
              <StatusBadge value={approval.executionStatus ?? "not requested"} />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Approval ID", approval.id],
                ["Requester", approval.requester],
                ["Submitted", approval.submitted],
                ["Risk", approval.risk],
                ["Reviewers required", `${approval.approvedReviewerCount ?? 0}/${policyEvaluation.requiredReviewerCount}`],
                ["Payload hash", approval.payloadHash ?? policyEvaluation.payloadHash],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-600">{label}</p>
                  <p className="mt-2 break-all font-semibold text-slate-200">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Policy evaluation</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Policy", policyEvaluation.policyName],
                ["Policy key", policyEvaluation.policyKey],
                ["Exact payload", policyEvaluation.exactPayloadRequired ? "Required" : "Not required"],
                ["Separation of duties", policyEvaluation.requiresSeparationOfDuties ? "Required" : "Not required"],
                ["Approval expires after", `${policyEvaluation.expiresAfterMinutes} minutes`],
                ["Requires approval", policyEvaluation.requiresApproval ? "Yes" : "No"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-600">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-200">{value}</p>
                </div>
              ))}
            </div>
            <ul className="mt-4 space-y-2">
              {policyEvaluation.reasons.map((reason) => (
                <li key={reason} className="rounded-xl border border-cyan-400/15 bg-cyan-400/8 p-3 text-sm text-cyan-100">{reason}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Exact approved payload</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Protected execution must submit this exact payload. Any drift creates a different hash and is blocked.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-white/8 bg-black/30 p-4 text-xs leading-6 text-cyan-100">
              {exactPayload}
            </pre>
          </div>
        </div>

        <aside className="space-y-6">
          <DemoDecisionPanel approvalId={approval.id} onDecision={stageApprovalDecisionAction} />

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Execution verification</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This verifies approval status, expiry and exact payload hash. It does not execute the protected action.
            </p>
            <form action={verifyApprovalExecutionAction} className="mt-4 space-y-3">
              <input type="hidden" name="approvalId" value={approval.id} />
              <label className="block text-sm text-slate-400">
                Execution payload JSON
                <textarea
                  name="executionPayload"
                  rows={8}
                  defaultValue={exactPayload}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-slate-100 outline-none transition focus:border-blue-400/50"
                />
              </label>
              <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
                Verify exact payload
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Decision history</h2>
            <div className="mt-4 space-y-3">
              {decisions.length ? (
                decisions.map((event) => (
                  <div key={event.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                    <p className="text-sm font-medium text-slate-200">{event.decision}</p>
                    {event.comment ? <p className="mt-1 text-sm leading-6 text-slate-500">{event.comment}</p> : null}
                    <p className="mt-1 break-all text-xs text-slate-600">{event.decidedBy ?? "Unknown reviewer"} / {new Date(event.decidedAt).toLocaleString("en-GB")}</p>
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-600">{event.payloadHashAtDecision}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-500">No live decisions recorded yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Execution checks</h2>
            <div className="mt-4 space-y-3">
              {executionChecks.length ? (
                executionChecks.map((check) => (
                  <div key={check.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-200">{check.status}</p>
                      <StatusBadge value={check.verified ? "verified" : "blocked"} />
                    </div>
                    {check.failureReason ? <p className="mt-2 text-sm leading-6 text-rose-100">{check.failureReason}</p> : null}
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-600">Expected: {check.expectedPayloadHash}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-600">Actual: {check.actualPayloadHash}</p>
                    <p className="mt-2 text-xs text-slate-600">{new Date(check.checkedAt).toLocaleString("en-GB")}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-500">No execution verification attempts yet.</p>
              )}
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}
