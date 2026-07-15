import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icons } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { getWorkflows } from "@/lib/repositories/staffer";

export default async function WorkflowsPage() {
  const workflows = await getWorkflows();

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
    </>
  );
}
