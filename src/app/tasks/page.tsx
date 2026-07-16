import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icons } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { getTasks } from "@/lib/repositories/staffer";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const tasks = await getTasks();
  const kanbanStatuses = ["Draft", "Queued", "Running", "Blocked", "Review", "Approval", "Completed", "Failed", "Cancelled"];

  return (
    <>
      <PageHeading
        eyebrow="Task board"
        title="Work with an accountable owner."
        description="Every task records its owner, project, priority, state and approval path. Demo tasks are readable now; live mutations arrive after tenant repositories and audit events."
        action={
          <Link href="/tasks/new" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
            Create task
          </Link>
        }
      />
      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" description="Create a demo task to see the task review surface." actionHref="/tasks/new" actionLabel="Create task" icon={Icons.inbox} />
      ) : (
        <div className="space-y-6">
          <section className="overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.04] p-4">
            <div className="flex min-w-[980px] gap-3">
              {kanbanStatuses.map((status) => {
                const columnTasks = tasks.filter((task) => task.status.toLowerCase() === status.toLowerCase()).slice(0, 4);
                return (
                  <div key={status} className="w-52 shrink-0 rounded-xl border border-white/8 bg-black/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-slate-200">{status}</h2>
                      <span className="rounded-full border border-white/8 px-2 py-0.5 text-xs text-slate-500">{tasks.filter((task) => task.status.toLowerCase() === status.toLowerCase()).length}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {columnTasks.length ? (
                        columnTasks.map((task) => (
                          <Link key={task.id} href={`/tasks/${task.id}`} className="block rounded-lg border border-white/8 bg-white/[0.03] p-3 transition hover:border-cyan-300/25">
                            <p className="line-clamp-2 text-xs font-medium text-slate-200">{task.title}</p>
                            <p className="mt-2 text-[11px] text-slate-600">{task.id} · {task.priority}</p>
                          </Link>
                        ))
                      ) : (
                        <p className="rounded-lg border border-dashed border-white/8 p-3 text-xs text-slate-600">No tasks</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="border-b border-white/8 bg-white/[0.025] text-xs uppercase tracking-wider text-slate-600">
                  <tr>{["ID", "Task", "Project", "Owner", "Priority", "Status", "Due"].map((h) => <th key={h} className="px-5 py-4 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-b border-white/6 last:border-0 hover:bg-white/[0.025]">
                      <td className="font-mono text-xs text-slate-600">
                        <Link href={`/tasks/${task.id}`} className="block px-5 py-4">{task.id}</Link>
                      </td>
                      <td className="font-medium text-slate-200">
                        <Link href={`/tasks/${task.id}`} className="block px-5 py-4 hover:text-cyan-200">{task.title}</Link>
                      </td>
                      <td className="text-slate-500">
                        <Link href={`/tasks/${task.id}`} className="block px-5 py-4">{task.project}</Link>
                      </td>
                      <td className="text-slate-400">
                        <Link href={`/tasks/${task.id}`} className="block px-5 py-4">{task.owner}</Link>
                      </td>
                      <td className="px-5 py-4"><StatusBadge value={task.priority} /></td>
                      <td className="px-5 py-4"><StatusBadge value={task.status} /></td>
                      <td className="text-slate-500">
                        <Link href={`/tasks/${task.id}`} className="block px-5 py-4">{task.due}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
