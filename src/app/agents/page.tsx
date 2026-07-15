import Link from "next/link";
import { AgentCard } from "@/components/agent-card";
import { PageHeading } from "@/components/page-heading";
import { getAgents, getSkills } from "@/lib/repositories/staffer";

export default async function AgentsPage() {
  const [agents, skills] = await Promise.all([getAgents(), getSkills()]);

  return (
    <>
      <PageHeading
        eyebrow="AI staff directory"
        title="Meet the team."
        description="Each agent has a human profile, specialist skills, limited tools, an autonomy level, and explicit approval boundaries. Live mode reads these through tenant-aware repositories."
        action={
          <Link href="/agents/new" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
            Create agent
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>

      <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.04] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Skills catalogue</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Organisation skills are now first-class records and can be mapped to agent profiles with proficiency levels.
            </p>
          </div>
          <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs text-blue-200">{skills.length} skills</span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {skills.slice(0, 24).map((skill) => (
            <span key={skill.key} className="rounded-full border border-white/8 bg-black/10 px-3 py-1.5 text-xs text-slate-300">
              {skill.name}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
