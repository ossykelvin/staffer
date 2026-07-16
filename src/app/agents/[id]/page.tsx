import Link from "next/link";
import { notFound } from "next/navigation";
import {
  assignAgentSkillAction,
  confirmAgentProfileAction,
  assignAgentToolAction,
  createSkillAction,
  createToolAction,
  removeAgentSkillAction,
  removeAgentToolAction,
  rollbackAgentVersionAction,
  setAgentStatusAction,
  updateAgentAction,
} from "@/app/agents/actions";
import { AgentAvatar } from "@/components/agent-avatar";
import { AgentProfileForm } from "@/components/agent-profile-form";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { agents } from "@/lib/data";
import { getAgentById, getAgentVersions, getSkills, getTools } from "@/lib/repositories/staffer";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return agents.map((agent) => ({ id: agent.id }));
}

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const [agent, skills, tools, versions, query] = await Promise.all([getAgentById(id), getSkills(), getTools(), getAgentVersions(id), searchParams]);
  if (!agent) notFound();
  const displayedSkills = agent.skillDetails?.length
    ? agent.skillDetails
    : agent.skills.map((skill) => ({ key: skill, name: skill, id: undefined, proficiency: undefined }));
  const displayedTools = agent.toolDetails?.length
    ? agent.toolDetails
    : agent.tools.map((tool) => ({ key: tool, name: tool, id: undefined, riskClass: 1, requiresApproval: false, isActive: true, constraints: undefined }));
  const runtimeLimits = [
    { label: "Primary model", value: agent.primaryModel ?? "Organisation default" },
    { label: "Fallback model", value: agent.fallbackModel ?? "Organisation default" },
    { label: "Maximum steps", value: agent.maximumSteps ? String(agent.maximumSteps) : "Organisation default" },
    { label: "Maximum cost", value: agent.maximumCostUsd !== undefined ? `$${agent.maximumCostUsd}` : "Organisation default" },
    { label: "Input tokens", value: agent.maximumInputTokens ? String(agent.maximumInputTokens) : "Organisation default" },
    { label: "Output tokens", value: agent.maximumOutputTokens ? String(agent.maximumOutputTokens) : "Organisation default" },
  ];

  return (
    <>
      <PageHeading
        eyebrow={agent.department}
        title={agent.name}
        description={`${agent.summary} ${agent.version ? `Version ${agent.version}.` : ""}`}
        action={
          <Link href="/agents" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/7">
            Back to staff directory
          </Link>
        }
      />

      {query.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{query.error}</div> : null}
      {query.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5 text-sm text-emerald-100">{query.message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <div className="flex items-center gap-4">
            <AgentAvatar agent={agent} size="lg" priority />
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
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-600">Version</dt>
              <dd className="mt-1 text-slate-300">v{agent.version ?? 1}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-600">Avatar</dt>
              <dd className="mt-1 text-slate-300">{agent.avatarMode ?? (agent.avatarPath ? "image_path" : "initials")}</dd>
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

          <div className="mt-7 border-t border-white/7 pt-6">
            <p className="text-xs uppercase tracking-wider text-slate-600">Lifecycle controls</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["draft", "active", "retired"].map((status) => (
                <form key={status} action={setAgentStatusAction}>
                  <input type="hidden" name="key" value={agent.id} />
                  <input type="hidden" name="status" value={status} />
                  <button
                    type="submit"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/7"
                  >
                    Set {status}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className="mt-7 border-t border-white/7 pt-6">
            <p className="text-xs uppercase tracking-wider text-slate-600">Runtime guardrails</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {runtimeLimits.map((limit) => (
                <div key={limit.label} className="rounded-xl border border-white/7 bg-black/10 p-3">
                  <dt className="text-xs text-slate-600">{limit.label}</dt>
                  <dd className="mt-1 break-all text-slate-300">{limit.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold">Core skills</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {displayedSkills.map((skill) => (
                <div key={skill.key} className="rounded-xl border border-blue-400/10 bg-blue-400/5 p-3 text-sm text-slate-300">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p>{skill.name}</p>
                      {"proficiency" in skill && skill.proficiency ? <p className="mt-1 text-xs text-blue-200">Proficiency {skill.proficiency}/5</p> : null}
                    </div>
                    {agent.databaseId && skill.id ? (
                      <form action={removeAgentSkillAction}>
                        <input type="hidden" name="agentKey" value={agent.id} />
                        <input type="hidden" name="agentId" value={agent.databaseId} />
                        <input type="hidden" name="skillId" value={skill.id} />
                        <button type="submit" className="text-xs text-slate-500 transition hover:text-rose-200">Remove</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold">Skill catalogue mapping</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Create reusable organisation skills, then map them to this agent with a proficiency level.</p>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <form action={createSkillAction} className="space-y-3 rounded-xl border border-white/7 bg-black/10 p-4">
                <input type="hidden" name="agentKey" value={agent.id} />
                <label className="block text-sm text-slate-400">
                  Skill name
                  <input name="name" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
                </label>
                <label className="block text-sm text-slate-400">
                  Skill key
                  <input name="key" placeholder="generated from name if blank" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
                </label>
                <label className="block text-sm text-slate-400">
                  Description
                  <textarea name="description" rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
                </label>
                <button type="submit" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">Add skill</button>
              </form>

              <form action={assignAgentSkillAction} className="space-y-3 rounded-xl border border-white/7 bg-black/10 p-4">
                <input type="hidden" name="agentKey" value={agent.id} />
                <input type="hidden" name="agentId" value={agent.databaseId ?? ""} />
                <label className="block text-sm text-slate-400">
                  Catalogue skill
                  <select name="skillId" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
                    {skills.map((skill) => (
                      <option key={skill.key} value={skill.id ?? skill.key}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-400">
                  Proficiency
                  <select name="proficiency" defaultValue="3" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <option key={level} value={level}>
                        {level}/5
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">Map skill</button>
              </form>
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
              <h2 className="font-semibold">Permitted tools</h2>
              <div className="mt-4 space-y-3">
                {displayedTools.map((tool) => (
                  <div key={tool.key} className="rounded-xl border border-white/7 bg-black/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-slate-300">{tool.key}</p>
                        <p className="mt-1 text-sm text-slate-400">{tool.name}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Risk {tool.riskClass}/5 · {tool.requiresApproval ? "approval required" : "no default approval"} · {tool.isActive ? "active" : "inactive"}
                        </p>
                      </div>
                      {agent.databaseId && tool.id ? (
                        <form action={removeAgentToolAction}>
                          <input type="hidden" name="agentKey" value={agent.id} />
                          <input type="hidden" name="agentId" value={agent.databaseId} />
                          <input type="hidden" name="toolId" value={tool.id} />
                          <button type="submit" className="text-xs text-slate-500 transition hover:text-rose-200">Remove</button>
                        </form>
                      ) : null}
                    </div>
                    {tool.constraints && Object.keys(tool.constraints).length ? (
                      <pre className="mt-3 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-slate-500">{JSON.stringify(tool.constraints, null, 2)}</pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-400/12 bg-amber-400/[0.035] p-6">
              <h2 className="font-semibold text-amber-200">Approval boundaries</h2>
              {agent.requiresApproval.length ? (
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
                  {agent.requiresApproval.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">No legacy approval notes configured.</p>
              )}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-rose-400/12 bg-rose-400/[0.035] p-6">
              <h2 className="font-semibold text-rose-200">Prohibited actions</h2>
              {agent.prohibitedActions?.length ? (
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
                  {agent.prohibitedActions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">No explicit prohibited actions configured for this agent.</p>
              )}
            </div>
            <div className="rounded-2xl border border-cyan-400/12 bg-cyan-400/[0.035] p-6">
              <h2 className="font-semibold text-cyan-200">Approval rules</h2>
              {agent.approvalRules?.length ? (
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
                  {agent.approvalRules.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">No per-agent approval rules configured yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold">Tool catalogue permissions</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Define narrow server-enforced tool contracts, then map only approved tools to this agent with explicit constraints.</p>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <form action={createToolAction} className="space-y-3 rounded-xl border border-white/7 bg-black/10 p-4">
                <input type="hidden" name="agentKey" value={agent.id} />
                <label className="block text-sm text-slate-400">
                  Tool name
                  <input name="name" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
                </label>
                <label className="block text-sm text-slate-400">
                  Tool key
                  <input name="key" placeholder="generated from name if blank" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
                </label>
                <label className="block text-sm text-slate-400">
                  Description
                  <textarea name="description" rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50" />
                </label>
                <label className="block text-sm text-slate-400">
                  Risk class
                  <select name="riskClass" defaultValue="1" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
                    {[0, 1, 2, 3, 4, 5].map((level) => (
                      <option key={level} value={level}>Risk {level}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-400">
                  <input name="requiresApproval" type="checkbox" className="size-4 rounded border-white/10 bg-black/20" />
                  Requires approval by default
                </label>
                <input type="hidden" name="isActive" value="true" />
                <label className="block text-sm text-slate-400">
                  Input schema JSON
                  <textarea name="inputSchema" rows={3} defaultValue="{}" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-slate-100 outline-none transition focus:border-blue-400/50" />
                </label>
                <label className="block text-sm text-slate-400">
                  Output schema JSON
                  <textarea name="outputSchema" rows={3} defaultValue="{}" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-slate-100 outline-none transition focus:border-blue-400/50" />
                </label>
                <button type="submit" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">Add tool</button>
              </form>

              <form action={assignAgentToolAction} className="space-y-3 rounded-xl border border-white/7 bg-black/10 p-4">
                <input type="hidden" name="agentKey" value={agent.id} />
                <input type="hidden" name="agentId" value={agent.databaseId ?? ""} />
                <label className="block text-sm text-slate-400">
                  Catalogue tool
                  <select name="toolId" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50">
                    {tools.map((tool) => (
                      <option key={tool.key} value={tool.id ?? tool.key}>
                        {tool.name} · risk {tool.riskClass}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-400">
                  Permission constraints JSON
                  <textarea
                    name="constraints"
                    rows={7}
                    defaultValue={'{\n  "scope": "read_only",\n  "requiresApprovalOverride": null\n}'}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs text-slate-100 outline-none transition focus:border-blue-400/50"
                  />
                </label>
                <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">Map tool permission</button>
              </form>
            </div>
          </section>

          {agent.profileStatus === "founder_confirmed" ? (
            <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Profile confirmed</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">This profile has been confirmed by the founder. Future edits should be versioned and recorded in the agent audit history.</p>
              {agent.founderConfirmedAt ? (
                <p className="mt-3 text-xs text-emerald-200">Confirmed {new Date(agent.founderConfirmedAt).toLocaleString("en-GB")}</p>
              ) : null}
              {agent.founderConfirmationNotes ? <p className="mt-3 text-sm leading-6 text-slate-400">{agent.founderConfirmationNotes}</p> : null}
            </section>
          ) : (
            <section className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.05] p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">Profile confirmation needed</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">Confirm or replace this persona before enabling live agent execution.</p>
            </section>
          )}

          <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold">Founder confirmation workflow</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Record whether this draft persona is approved for live use or needs another profile pass.</p>
            <form action={confirmAgentProfileAction} className="mt-5 space-y-3">
              <input type="hidden" name="key" value={agent.id} />
              <label className="block text-sm text-slate-400">
                Confirmation notes
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Why this profile is confirmed, or what needs changing."
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="profileStatus"
                  value="founder_confirmed"
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Confirm profile
                </button>
                <button
                  type="submit"
                  name="profileStatus"
                  value="needs_review"
                  className="rounded-xl border border-violet-300/20 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-400/10"
                >
                  Request changes
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold">Version history</h2>
            <div className="mt-4 space-y-3">
              {versions.length ? (
                versions.map((version) => (
                  <div key={version.id} className="rounded-xl border border-white/7 bg-black/10 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-mono text-xs text-blue-200">v{version.version}</p>
                      <p className="text-xs text-slate-500">{new Date(version.createdAt).toLocaleString("en-GB")}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{version.changeSummary}</p>
                    {version.version !== (agent.version ?? 1) ? (
                      <form action={rollbackAgentVersionAction} className="mt-3">
                        <input type="hidden" name="key" value={agent.id} />
                        <input type="hidden" name="versionId" value={version.id} />
                        <button type="submit" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/7">
                          Roll back to v{version.version}
                        </button>
                      </form>
                    ) : (
                      <p className="mt-3 text-xs text-emerald-300">Current version</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-500">No version records yet. The next live edit will create one.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.04] p-6">
        <h2 className="font-semibold">Edit profile</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Live saves update the tenant-owned profile, increment the version, persist a snapshot, and emit an audit event.</p>
        <div className="mt-6">
          <AgentProfileForm agent={agent} action={updateAgentAction} submitLabel="Save profile version" />
        </div>
      </section>
    </>
  );
}
