import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { TaskTransitionPanel } from "@/components/task-transition-panel";
import { getTaskDetail } from "@/lib/demo-details";
import { tasks } from "@/lib/data";
import { getTaskById } from "@/lib/repositories/staffer";
import { stageTaskTransitionAction } from "@/app/tasks/[id]/actions";

export function generateStaticParams() {
  return tasks.map((task) => ({ id: task.id }));
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTaskById(id);

  if (!task) {
    notFound();
  }

  const detail = getTaskDetail(task);

  return (
    <>
      <PageHeading
        eyebrow="Task detail"
        title={task.title}
        description={detail.description}
        action={
          <Link href="/tasks" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">
            Back to board
          </Link>
        }
      />
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Task ID", task.id],
              ["Owner", task.owner],
              ["Project", task.project],
              ["Due", task.due],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/8 bg-black/10 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-600">{label}</p>
                <p className="mt-2 font-semibold text-slate-200">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <StatusBadge value={task.priority} />
            <StatusBadge value={task.status} />
          </div>
          <div className="mt-6 rounded-xl border border-amber-400/15 bg-amber-400/8 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Approval path</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{detail.approvalPath}</p>
          </div>
          <div className="mt-6">
            <h2 className="font-semibold text-white">Evidence</h2>
            <ul className="mt-3 space-y-3">
              {detail.evidence.map((item) => (
                <li key={item} className="rounded-xl border border-white/8 bg-black/10 p-4 text-sm text-slate-400">{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <aside className="space-y-6">
          <TaskTransitionPanel taskId={task.id} onTransition={stageTaskTransitionAction} />
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Owner context</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {detail.owner ? `${detail.owner.name} is responsible for this item as ${detail.owner.jobTitle}.` : "This task is assigned to a human or external owner not yet modelled as an agent."}
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Next action</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">{detail.nextAction}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Activity</h2>
            <div className="mt-4 space-y-3">
              {detail.activity.map((event) => (
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
