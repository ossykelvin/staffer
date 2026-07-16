import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { Icons } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { getGovernanceDashboard } from "@/lib/repositories/staffer";

export const dynamic = "force-dynamic";

function money(value: number) {
  return `$${value.toFixed(4)}`;
}

function ms(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}ms` : "No data";
}

export default async function GovernancePage() {
  const dashboard = await getGovernanceDashboard();
  const totalCost = dashboard.cost.taskRunCostUsd + dashboard.cost.toolCostUsd;
  const totalFailures = dashboard.failures.workflowFailures + dashboard.failures.toolFailures + dashboard.failures.approvalBlocks;

  return (
    <>
      <PageHeading
        eyebrow="Governance dashboard"
        title="Audit, cost, quality, latency and failure signals."
        description="Monitor Staffer's governed operating loop from one tenant-scoped dashboard. Metrics are aggregated from audit logs, task runs, tool executions, approvals and workflows."
        action={
          <Link href="/approvals" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">
            Review approvals
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Audit events" value={String(dashboard.audit.events)} note={`${dashboard.audit.materialMutations} material mutations`} icon={Icons.shield} href="/governance" />
        <MetricCard label="Total cost" value={money(totalCost)} note={`${money(dashboard.cost.taskRunCostUsd)} task runs`} icon={Icons.activity} href="/governance" />
        <MetricCard label="Pending approvals" value={String(dashboard.quality.pendingApprovals)} note="Protected decisions waiting" icon={Icons.approvals} href="/approvals" />
        <MetricCard label="Avg latency" value={ms(dashboard.latency.averageTaskRunMs ?? dashboard.latency.averageToolMs)} note={`Tools ${ms(dashboard.latency.averageToolMs)}`} icon={Icons.automation} href="/workflows" />
        <MetricCard label="Failure signals" value={String(totalFailures)} note="Workflows, tools, execution blocks" icon={Icons.inbox} href="/tasks" />
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold text-white">Quality and work health</h2>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["Completed tasks", dashboard.quality.completedTasks, "text-emerald-300"],
              ["Blocked tasks", dashboard.quality.blockedTasks, "text-amber-300"],
              ["Failed tasks", dashboard.quality.failedTasks, "text-rose-300"],
            ].map(([label, value, colour]) => (
              <div key={String(label)} className="rounded-xl border border-white/8 bg-black/10 p-4">
                <dt className="text-xs uppercase tracking-wider text-slate-600">{label}</dt>
                <dd className={`mt-2 text-2xl font-semibold ${colour}`}>{String(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-sm leading-6 text-slate-500">
            Failed, blocked and approval-waiting tasks feed notification queues so human owners can intervene without silent failure.
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold text-white">Failure breakdown</h2>
          <div className="mt-5 space-y-3">
            {[
              ["Workflow failures", dashboard.failures.workflowFailures],
              ["Tool failures", dashboard.failures.toolFailures],
              ["Approval execution blocks", dashboard.failures.approvalBlocks],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 p-4 text-sm">
                <span className="text-slate-400">{label}</span>
                <span className="font-semibold text-slate-100">{String(value)}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-500">
            Protected execution checks are tracked separately from ordinary workflow failures because they represent the approval gate doing its job.
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold text-white">Cost and latency</h2>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-black/10 p-4">
              <dt className="text-xs uppercase tracking-wider text-slate-600">Task run cost</dt>
              <dd className="mt-2 text-xl font-semibold text-cyan-200">{money(dashboard.cost.taskRunCostUsd)}</dd>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/10 p-4">
              <dt className="text-xs uppercase tracking-wider text-slate-600">Tool cost</dt>
              <dd className="mt-2 text-xl font-semibold text-cyan-200">{money(dashboard.cost.toolCostUsd)}</dd>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/10 p-4">
              <dt className="text-xs uppercase tracking-wider text-slate-600">Average task run</dt>
              <dd className="mt-2 text-xl font-semibold text-blue-200">{ms(dashboard.latency.averageTaskRunMs)}</dd>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/10 p-4">
              <dt className="text-xs uppercase tracking-wider text-slate-600">Average tool call</dt>
              <dd className="mt-2 text-xl font-semibold text-blue-200">{ms(dashboard.latency.averageToolMs)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold text-white">Audit chain</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Audit events use the existing append-only log with previous/current hashes. Latest event:{" "}
            <span className="text-slate-200">{dashboard.audit.latestAt ? new Date(dashboard.audit.latestAt).toLocaleString("en-GB") : "No events yet"}</span>.
          </p>
          <div className="mt-5 rounded-xl border border-blue-400/15 bg-blue-400/8 p-4 text-sm leading-6 text-slate-400">
            PB-027 starts with operational governance metrics. Phase 10 still needs deeper exports, backup/restore, security alerts and DPIA templates.
          </div>
        </div>
      </section>
    </>
  );
}
