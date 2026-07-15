import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { workflows } from "@/lib/data";
import { getWorkflowDryRun } from "@/lib/demo-details";
import { getWorkflowById } from "@/lib/repositories/staffer";

export function generateStaticParams() {
  return workflows.map((workflow) => ({ id: workflow.id }));
}

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = await getWorkflowById(id);

  if (!workflow) {
    notFound();
  }

  const dryRun = getWorkflowDryRun(workflow);

  return (
    <>
      <PageHeading
        eyebrow="Workflow dry-run"
        title={workflow.name}
        description="Inspect the deterministic path before live execution exists. This dry-run is display-only and cannot trigger tools, external sends, production changes, or database mutations."
        action={
          <Link href="/workflows" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">
            Back to workflows
          </Link>
        }
      />
      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <aside className="space-y-6">
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <div className="flex flex-wrap gap-2">
              <StatusBadge value={workflow.status} />
              <StatusBadge value={workflow.department} />
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-600">Trigger</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{workflow.trigger}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-600">Approval</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{workflow.approval}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-600">Target</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{workflow.sla}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/8 p-6">
            <h2 className="font-semibold text-white">Execution blocked</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Live workflow execution requires durable runs, idempotency, approval verification, and append-only audit logging.
            </p>
          </div>
        </aside>
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold text-white">Dry-run timeline</h2>
          <ol className="mt-5 space-y-4">
            {dryRun.map((event, index) => (
              <li key={`${event.label}-${index}`} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-blue-400/20 bg-blue-400/8 text-xs font-semibold text-blue-300">{index + 1}</span>
                <div className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <h3 className="font-medium text-slate-200">{event.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{event.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
