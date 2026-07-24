import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icons } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { createWorkflowLifecycleRequestAction } from "@/app/workflows/lifecycle-actions";
import { getWorkflowLifecycleData, getWorkflows } from "@/lib/repositories/staffer";

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const [workflows, lifecycleData, feedback] = await Promise.all([getWorkflows(), getWorkflowLifecycleData(), searchParams]);

  return (
    <>
      <PageHeading
        eyebrow="Workflow studio"
        title="Deterministic operations around intelligent agents."
        description="Agents make judgements inside controlled steps. Workflows own retries, conditions, approvals, deadlines and audit evidence."
        action={
          <button
            type="button"
            disabled
            title="New workflow creation is blocked until live repositories and versioning exist."
            className="cursor-not-allowed rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-500"
          >
            New workflow blocked
          </button>
        }
      />
      {feedback.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{feedback.message}</div> : null}
      {feedback.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">{feedback.error}</div> : null}
      {workflows.length === 0 ? (
        <EmptyState title="No workflows configured" description="Workflow definitions will appear here after the registry is connected." icon={Icons.automation} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {workflows.map((workflow) => (
            <Link key={workflow.id} href={`/workflows/${workflow.id}`} className="rounded-2xl border border-white/8 bg-white/[0.04] p-6 transition hover:-translate-y-0.5 hover:border-blue-400/25 hover:bg-white/[0.065]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">{workflow.department}</p>
                  <h2 className="mt-2 text-xl font-semibold">{workflow.name}</h2>
                </div>
                <StatusBadge value={workflow.status} />
              </div>
              <div className="mt-5 rounded-xl border border-white/7 bg-black/10 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-600">Trigger</p>
                <p className="mt-2 text-sm text-slate-300">{workflow.trigger}</p>
              </div>
              <ol className="mt-5 space-y-3">
                {workflow.steps.slice(0, 4).map((step, index) => (
                  <li key={step} className="flex items-center gap-3 text-sm text-slate-400">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-blue-400/20 bg-blue-400/8 text-xs font-semibold text-blue-300">{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-xs font-semibold text-blue-300">Open workflow console -&gt;</p>
            </Link>
          ))}
        </div>
      )}
      <section className="mt-8 rounded-2xl border border-white/8 bg-white/[0.04] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-blue-300">PB-036+ lifecycle foundations</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Remaining operating lifecycles</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              These are now tenant-owned lifecycle definitions with request queues, task evidence and audit records. Each one can be implemented as the next vertical workflow slice.
            </p>
          </div>
          <StatusBadge value={`${lifecycleData.lifecycles.length} active`} />
        </div>
        {lifecycleData.lifecycles.length ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {lifecycleData.lifecycles.map((lifecycle) => (
              <article key={lifecycle.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-100">{lifecycle.name}</h3>
                    <p className="mt-1 text-xs uppercase tracking-wider text-slate-600">{lifecycle.ownerAgentKey ?? "unassigned"} / {lifecycle.status}</p>
                  </div>
                  <StatusBadge value={`${lifecycle.requestCount} queued`} />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">{lifecycle.description}</p>
                <div className="mt-4 grid gap-3 text-xs text-slate-500 md:grid-cols-2">
                  <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                    <p className="uppercase tracking-wider text-slate-600">Triggers</p>
                    <p className="mt-1">{lifecycle.triggerTypes.join(", ") || "manual_request"}</p>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                    <p className="uppercase tracking-wider text-slate-600">Protected actions</p>
                    <p className="mt-1">{lifecycle.requiredApprovalActions.join(", ") || "none"}</p>
                  </div>
                </div>
                <ol className="mt-4 space-y-2">
                  {lifecycle.defaultSteps.slice(0, 4).map((step, index) => (
                    <li key={String(step.key ?? `${lifecycle.key}-${index}`)} className="flex gap-3 text-sm text-slate-400">
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-blue-400/20 bg-blue-400/8 text-[11px] font-semibold text-blue-300">{index + 1}</span>
                      {String(step.name ?? step.key ?? "Lifecycle step")}
                    </li>
                  ))}
                </ol>
                <form action={createWorkflowLifecycleRequestAction} className="mt-5 space-y-3 rounded-lg border border-blue-400/15 bg-blue-400/[0.04] p-3">
                  <input type="hidden" name="lifecycleKey" value={lifecycle.key} />
                  <input type="hidden" name="triggerType" value="manual_request" />
                  <label className="block text-sm text-slate-300">
                    Request summary
                    <input name="summary" required placeholder={`Queue ${lifecycle.name.toLowerCase()} work`} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400" />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Evidence / context
                    <textarea name="evidence" rows={3} placeholder="Approved source, business reason, evidence link or requested outcome." className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400" />
                  </label>
                  <button className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-400">Queue lifecycle request</button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-slate-500">No lifecycle records exist yet. Apply the PB-036+ migration to seed the lifecycle registry.</p>
        )}
        {lifecycleData.requests.length ? (
          <div className="mt-6 rounded-xl border border-white/8 bg-black/10 p-4">
            <h3 className="font-semibold text-white">Recent lifecycle requests</h3>
            <div className="mt-4 space-y-3">
              {lifecycleData.requests.slice(0, 5).map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] p-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-200">{String(request.triggerPayload.summary ?? request.triggerType)}</p>
                    <p className="mt-1 text-xs text-slate-600">{new Date(request.createdAt).toLocaleString("en-GB")}</p>
                  </div>
                  <StatusBadge value={request.status} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
