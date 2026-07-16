import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { createTaskAction } from "@/app/tasks/new/actions";
import { getAgents } from "@/lib/repositories/staffer";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const [agents, params] = await Promise.all([getAgents(), searchParams]);

  return (
    <>
      <PageHeading
        eyebrow="Create task"
        title="Assign governed work."
        description="Create a live tenant task with human or agent assignment, priority, due date, project linkage, idempotency and audit evidence."
      />
      {params.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{params.message}</div> : null}
      {params.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">{params.error}</div> : null}
      <form action={createTaskAction} className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="text-sm text-slate-400">
            Task title
            <input name="title" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" placeholder="Prepare release evidence" />
          </label>
          <label className="text-sm text-slate-400">
            Project
            <input name="project" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" placeholder="Staffer" />
          </label>
          <label className="text-sm text-slate-400">
            Assignee
            <select name="assignee" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
              <option value="user:self">Me / human owner</option>
              {agents
                .filter((agent) => agent.databaseId)
                .map((agent) => (
                  <option key={agent.databaseId} value={`agent:${agent.databaseId}`}>
                    {agent.name} — {agent.jobTitle}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm text-slate-400">
            Priority
            <select name="priority" defaultValue="Medium" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
              {["Critical", "High", "Medium", "Low"].map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-400">
            Initial status
            <select name="status" defaultValue="queued" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
              {["draft", "queued", "running", "blocked", "review", "approval", "completed", "failed", "cancelled"].map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-400">
            Due date
            <input name="dueAt" type="datetime-local" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
          </label>
          <label className="text-sm text-slate-400 md:col-span-2">
            Idempotency key
            <input name="idempotencyKey" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" placeholder="Optional external/system key to prevent duplicate creation" />
          </label>
          <label className="text-sm text-slate-400 md:col-span-2">
            Description
            <textarea name="description" className="mt-2 min-h-32 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" placeholder="Add the expected outcome, evidence needed, approval path and constraints." />
          </label>
        </div>
        <div className="mt-6 rounded-xl border border-blue-400/15 bg-blue-400/8 p-4 text-sm leading-6 text-slate-400">
          Live creation records a task evidence event, queues any relevant notifications, and writes an audit log. Demo mode still redirects with a non-persistent staging message.
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">Create task</button>
          <Link href="/tasks" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
