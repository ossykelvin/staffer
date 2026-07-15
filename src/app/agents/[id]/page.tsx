import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { agents } from "@/lib/data";
import { getAgentById } from "@/lib/repositories/staffer";

export function generateStaticParams() {
  return agents.map((agent) => ({ id: agent.id }));
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentById(id);
  if (!agent) notFound();

  return (
    <>
      <PageHeading
        eyebrow={agent.department}
        title={agent.name}
        description={agent.summary}
        action={
          <Link href="/agents" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/7">
            Back to staff directory
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <div className="flex items-center gap-4">
            {agent.avatarPath ? (
              <span className="relative size-24 overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-xl shadow-blue-950/50">
                <Image src={agent.avatarPath} alt={`${agent.name}, ${agent.jobTitle}`} fill priority sizes="96px" className="object-cover" />
              </span>
            ) : (
              <span className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-400 text-xl font-bold shadow-xl shadow-blue-950/50">
                {agent.initials}
              </span>
            )}
            <div>
              <h2 className="text-xl font-semibold">{agent.jobTitle}</h2>
              <p className="mt-1 text-sm text-slate-500">{agent.location}</p>
              <div className="mt-3">
                <StatusBadge value={agent.status} />
              </div>
            </div>
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-600">Pronouns</dt>
              <dd className="mt-1 text-slate-300">{agent.pronouns}</dd>
            </div>
            {agent.age ? (
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-600">Age</dt>
                <dd className="mt-1 text-slate-300">{agent.age}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-600">Experience</dt>
              <dd className="mt-1 text-slate-300">{agent.experienceYears} years</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-600">Timezone</dt>
              <dd className="mt-1 text-slate-300">{agent.timezone}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-600">Autonomy</dt>
              <dd className="mt-1 text-slate-300">Level {agent.autonomyLevel}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-600">Profile</dt>
              <dd className="mt-1 text-emerald-300">{agent.profileStatus}</dd>
            </div>
          </dl>

          <div className="mt-7 border-t border-white/7 pt-6">
            <p className="text-xs uppercase tracking-wider text-slate-600">Communication style</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{agent.communicationStyle}</p>
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-wider text-slate-600">Personality</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {agent.personality.map((item) => (
                <span key={item} className="rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-xs text-slate-300">{item}</span>
              ))}
            </div>
          </div>

          {agent.background ? (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider text-slate-600">Background</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{agent.background}</p>
            </div>
          ) : null}
          {agent.personalDetail ? (
            <div className="mt-6 rounded-xl border border-violet-400/10 bg-violet-400/[0.045] p-4">
              <p className="text-xs uppercase tracking-wider text-violet-300">Human detail</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{agent.personalDetail}</p>
            </div>
          ) : null}
          {agent.signatureHabit ? (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider text-slate-600">Working habit</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{agent.signatureHabit}</p>
            </div>
          ) : null}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold">Core skills</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {agent.skills.map((skill) => (
                <div key={skill} className="rounded-xl border border-blue-400/10 bg-blue-400/5 p-3 text-sm text-slate-300">{skill}</div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
              <h2 className="font-semibold">Permitted tools</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                {agent.tools.map((tool) => (
                  <li key={tool} className="font-mono text-xs">{tool}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-400/12 bg-amber-400/[0.035] p-6">
              <h2 className="font-semibold text-amber-200">Approval boundaries</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
                {agent.requiresApproval.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          {agent.profileStatus === "founder_confirmed" ? (
            <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Profile confirmed</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">This profile has been confirmed by the founder. Future edits should be versioned and recorded in the agent audit history.</p>
            </section>
          ) : (
            <section className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.05] p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">Profile confirmation needed</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">Confirm or replace this persona before enabling live agent execution.</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
