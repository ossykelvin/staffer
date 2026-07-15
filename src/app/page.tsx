import Link from "next/link";
import { AgentCard } from "@/components/agent-card";
import { Icons } from "@/components/icons";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { getDashboardData } from "@/lib/repositories/staffer";

export default async function HomePage() {
  const { agents, approvals, tasks } = await getDashboardData();
  const activeTasks = tasks.filter((task) => task.status !== "Completed");

  return (
    <>
      <PageHeading
        eyebrow="Command centre"
        title="Your AI workforce, under control."
        description="Monitor work, review decisions, and move every agent from suggestion to approved action through one governed operating system."
        action={
          <Link
            href="/tasks/new"
            className="inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500"
          >
            Assign work
          </Link>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active agents" value={String(agents.length)} note="Open the staff directory" icon={Icons.agents} href="/agents" />
        <MetricCard label="Open work" value={String(activeTasks.length)} note="Review the task board" icon={Icons.inbox} href="/tasks" />
        <MetricCard label="Approvals" value={String(approvals.length)} note="Inspect protected decisions" icon={Icons.approvals} href="/approvals" />
        <MetricCard label="Automation health" value="98.4%" note="Review workflow dry-runs" icon={Icons.activity} href="/workflows" />
      </section>
      <section className="mt-7 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Priority work</h2>
              <p className="mt-1 text-sm text-slate-500">Tasks needing attention across the operating system.</p>
            </div>
            <Link href="/tasks" className="text-xs font-semibold text-blue-300">
              View board -&gt;
            </Link>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="pb-3 font-medium">Task</th>
                  <th className="pb-3 font-medium">Owner</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {tasks.slice(0, 4).map((task) => (
                  <tr key={task.id} className="border-t border-white/7">
                    <td className="py-4 pr-4">
                      <Link href={`/tasks/${task.id}`} className="group block">
                        <p className="font-medium text-slate-200 group-hover:text-cyan-200">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {task.id} / {task.project}
                        </p>
                      </Link>
                    </td>
                    <td className="py-4 pr-4 text-slate-400">{task.owner}</td>
                    <td className="py-4 pr-4">
                      <StatusBadge value={task.status} />
                    </td>
                    <td className="py-4 text-slate-500">{task.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-blue-500/12 to-cyan-400/5 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-500/15">
              <Icons.brain className="size-5 text-cyan-300" />
            </span>
            <div>
              <h2 className="font-semibold">Founder decision brief</h2>
              <p className="text-xs text-slate-500">Prepared by Nathan</p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <Link href="/approvals" className="block rounded-xl border border-white/8 bg-black/10 p-4 transition hover:border-amber-300/25">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Decision required</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Confirm the first ten staff profiles and approve the Customer Support Triage workflow as the initial live automation.
              </p>
            </Link>
            <Link href="/settings" className="block rounded-xl border border-white/8 bg-black/10 p-4 transition hover:border-cyan-300/25">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Recommended next move</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Connect Supabase, seed the organisation, and keep all external actions in draft-only mode until test evidence is complete.
              </p>
            </Link>
          </div>
        </div>
      </section>
      <section className="mt-7">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">AI staff on duty</h2>
            <p className="mt-1 text-sm text-slate-500">Humanised profiles with defined expertise, personality and authority.</p>
          </div>
          <Link href="/agents" className="text-xs font-semibold text-blue-300">
            Open staff directory -&gt;
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{agents.slice(0, 3).map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>
      </section>
    </>
  );
}
