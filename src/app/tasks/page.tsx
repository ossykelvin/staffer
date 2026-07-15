import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icons } from "@/components/icons";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { getTasks } from "@/lib/repositories/staffer";

export default async function TasksPage() {
  const tasks = await getTasks();

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
      )}
    </>
  );
}
