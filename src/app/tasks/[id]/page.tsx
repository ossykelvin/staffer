import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { TaskTransitionPanel } from "@/components/task-transition-panel";
import { getTaskDetail } from "@/lib/demo-details";
import { tasks } from "@/lib/data";
import { getTaskById, getTaskCollaboration, getTasks } from "@/lib/repositories/staffer";
import {
  addTaskCommentAction,
  addTaskDependencyAction,
  addTaskEvidenceAction,
  addTaskWatcherAction,
  removeTaskDependencyAction,
  removeTaskWatcherAction,
  retryTaskAction,
  stageTaskTransitionAction,
} from "@/app/tasks/[id]/actions";

export function generateStaticParams() {
  return tasks.map((task) => ({ id: task.id }));
}

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const task = await getTaskById(id);

  if (!task) {
    notFound();
  }

  const detail = getTaskDetail(task);
  const [collaboration, allTasks, query] = await Promise.all([getTaskCollaboration(task.id), getTasks(), searchParams]);
  const dependencyOptions = allTasks.filter((item) => item.id !== task.id);
  const retryPolicyEntries = Object.entries(task.retryPolicy ?? {});

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
      {query.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{query.error}</div> : null}
      {query.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5 text-sm text-emerald-100">{query.message}</div> : null}
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
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
            {task.description ? <p className="mt-6 text-sm leading-6 text-slate-400">{task.description}</p> : null}
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Comments</h2>
            <form action={addTaskCommentAction} className="mt-4 space-y-3">
              <input type="hidden" name="taskReference" value={task.id} />
              <label className="block text-sm text-slate-400">
                Add comment
                <textarea name="body" rows={4} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
              </label>
              <label className="block text-sm text-slate-400">
                Visibility
                <select name="visibility" defaultValue="internal" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
                  <option value="internal">Internal</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">Add comment</button>
            </form>
            <div className="mt-5 space-y-3">
              {collaboration.comments.length ? (
                collaboration.comments.map((comment) => (
                  <article key={comment.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                    <p className="text-sm leading-6 text-slate-300">{comment.body}</p>
                    <p className="mt-2 text-xs text-slate-500">{comment.visibility} / {new Date(comment.createdAt).toLocaleString("en-GB")}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-500">No comments yet. Add the first operational note.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Dependencies</h2>
            <form action={addTaskDependencyAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_0.7fr]">
              <input type="hidden" name="taskReference" value={task.id} />
              <label className="block text-sm text-slate-400">
                Depends on
                <select name="dependsOnReference" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
                  <option value="">Choose task</option>
                  {dependencyOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.id} - {option.title}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-400">
                Type
                <select name="dependencyType" defaultValue="blocks" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
                  <option value="blocks">Blocks</option>
                  <option value="relates_to">Relates to</option>
                  <option value="duplicates">Duplicates</option>
                  <option value="parent">Parent</option>
                </select>
              </label>
              <label className="block text-sm text-slate-400 md:col-span-2">
                Notes
                <textarea name="notes" rows={2} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
              </label>
              <button type="submit" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7 md:w-fit">Add dependency</button>
            </form>
            <div className="mt-5 space-y-3">
              {collaboration.dependencies.length ? (
                collaboration.dependencies.map((dependency) => (
                  <div key={dependency.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-200">{dependency.dependencyType}: {dependency.dependsOnReference}</p>
                        <p className="mt-1 text-sm text-slate-500">{dependency.dependsOnTitle}</p>
                        {dependency.notes ? <p className="mt-2 text-sm leading-6 text-slate-400">{dependency.notes}</p> : null}
                      </div>
                      <form action={removeTaskDependencyAction}>
                        <input type="hidden" name="taskReference" value={task.id} />
                        <input type="hidden" name="dependencyId" value={dependency.id} />
                        <button type="submit" className="text-xs text-slate-500 transition hover:text-rose-200">Remove</button>
                      </form>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-500">No dependencies recorded.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Evidence timeline</h2>
            <form action={addTaskEvidenceAction} className="mt-4 space-y-3">
              <input type="hidden" name="taskReference" value={task.id} />
              <div className="grid gap-3 md:grid-cols-[0.7fr_1fr]">
                <label className="block text-sm text-slate-400">
                  Event type
                  <select name="eventType" defaultValue="evidence" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
                    <option value="evidence">Evidence</option>
                    <option value="attachment">Attachment reference</option>
                    <option value="system">System</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-400">
                  Title
                  <input name="title" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
                </label>
              </div>
              <label className="block text-sm text-slate-400">
                Body
                <textarea name="body" rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
              </label>
              <label className="block text-sm text-slate-400">
                Metadata JSON
                <textarea name="metadata" rows={3} defaultValue="{}" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-slate-100 outline-none transition focus:border-blue-400/50" />
              </label>
              <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">Record evidence</button>
            </form>
            <div className="mt-5 space-y-3">
              {[...collaboration.evidenceEvents].map((event) => (
                <article key={event.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-slate-200">{event.title}</p>
                    <span className="rounded-full border border-white/8 px-2 py-1 text-[11px] text-slate-500">{event.eventType}</span>
                  </div>
                  {event.body ? <p className="mt-2 text-sm leading-6 text-slate-400">{event.body}</p> : null}
                  <p className="mt-2 text-xs text-slate-600">{new Date(event.createdAt).toLocaleString("en-GB")}</p>
                </article>
              ))}
              {detail.evidence.map((item) => (
                <div key={item} className="rounded-xl border border-dashed border-white/8 bg-black/10 p-4 text-sm text-slate-500">{item}</div>
              ))}
            </div>
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
            <h2 className="font-semibold text-white">Watchers</h2>
            <div className="mt-4 space-y-3">
              {collaboration.watchers.length ? (
                collaboration.watchers.map((watcher) => (
                  <div key={watcher.userId} className="rounded-xl border border-white/8 bg-black/10 p-4">
                    <p className="break-all font-mono text-xs text-slate-300">{watcher.userId}</p>
                    <p className="mt-1 text-xs text-slate-600">Watching since {new Date(watcher.createdAt).toLocaleDateString("en-GB")}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-500">No watchers yet.</p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={addTaskWatcherAction}>
                <input type="hidden" name="taskReference" value={task.id} />
                <button type="submit" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/7">Watch task</button>
              </form>
              <form action={removeTaskWatcherAction}>
                <input type="hidden" name="taskReference" value={task.id} />
                <button type="submit" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/7">Stop watching</button>
              </form>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Retry controls</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-white/8 bg-black/10 p-4">
                <dt className="text-xs uppercase tracking-wider text-slate-600">Retry count</dt>
                <dd className="mt-1 text-slate-300">{task.retryCount ?? 0}</dd>
              </div>
              {task.lastRetryAt ? (
                <div className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <dt className="text-xs uppercase tracking-wider text-slate-600">Last retry</dt>
                  <dd className="mt-1 text-slate-300">{new Date(task.lastRetryAt).toLocaleString("en-GB")}</dd>
                </div>
              ) : null}
              {retryPolicyEntries.length ? (
                <div className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <dt className="text-xs uppercase tracking-wider text-slate-600">Retry policy</dt>
                  <dd className="mt-2 space-y-1 text-slate-400">
                    {retryPolicyEntries.map(([key, value]) => (
                      <span key={key} className="block font-mono text-xs">{key}: {String(value)}</span>
                    ))}
                  </dd>
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-500">No task-specific retry policy configured.</p>
              )}
            </dl>
            <form action={retryTaskAction} className="mt-4 space-y-3">
              <input type="hidden" name="taskReference" value={task.id} />
              <label className="block text-sm text-slate-400">
                Retry reason
                <textarea name="retryReason" rows={3} defaultValue={task.retryReason ?? ""} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
              </label>
              <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">Request retry</button>
            </form>
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
