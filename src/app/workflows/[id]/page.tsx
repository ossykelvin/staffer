import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { replayWorkflowRunAction, startWorkflowRunAction, transitionWorkflowRunAction } from "@/app/workflows/[id]/actions";
import { startFeatureIntakeAction } from "@/app/workflows/[id]/feature-intake-actions";
import { startSupportTriageAction } from "@/app/workflows/[id]/support-triage-actions";
import { workflows } from "@/lib/data";
import { getWorkflowDryRun } from "@/lib/demo-details";
import { getFeatureIntakeData, getSupportTriageData, getWorkflowById, getWorkflowExecutionDetail } from "@/lib/repositories/staffer";

export function generateStaticParams() {
  return workflows.map((workflow) => ({ id: workflow.id }));
}

export const dynamic = "force-dynamic";

function summarizeArtifact(value: Record<string, unknown>) {
  return Object.entries(value)
    .slice(0, 3)
    .map(([key, item]) => `${key}: ${Array.isArray(item) ? item.join(", ") : typeof item === "object" ? JSON.stringify(item) : String(item)}`)
    .join(" · ");
}

export default async function WorkflowDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { id } = await params;
  const feedback = await searchParams;
  const workflow = await getWorkflowById(id);

  if (!workflow) {
    notFound();
  }

  const dryRun = getWorkflowDryRun(workflow);
  const execution = await getWorkflowExecutionDetail(id);
  const supportTriage = id === "support-triage" ? await getSupportTriageData() : null;
  const featureIntake = id === "feature-intake" ? await getFeatureIntakeData() : null;
  const latestRun = execution.latestRun;
  const latestSteps = latestRun?.steps ?? [];
  const latestEvents = latestRun?.events ?? [];
  const canPause = latestRun && ["queued", "running", "waiting"].includes(latestRun.status);
  const canResume = latestRun?.status === "paused";
  const canRetry = latestRun && ["failed", "cancelled", "paused"].includes(latestRun.status) && latestRun.retryCount < latestRun.maxRetries;
  const canCancel = latestRun && !["completed", "cancelled"].includes(latestRun.status);

  return (
    <>
      <PageHeading
        eyebrow="Workflow dry-run"
        title={workflow.name}
        description="Inspect the deterministic path and manage durable run state. Protected actions still require approval verification before execution."
        action={
          <Link href="/workflows" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">
            Back to workflows
          </Link>
        }
      />
      {feedback.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{feedback.message}</div> : null}
      {feedback.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">{feedback.error}</div> : null}
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
          <div className="rounded-2xl border border-blue-400/15 bg-blue-400/8 p-6">
            <h2 className="font-semibold text-white">Durable execution</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Runs are stored with idempotency keys, step records, pause/resume state, retry counters, replay links and append-only events.
            </p>
            <form action={startWorkflowRunAction} className="mt-5">
              <input type="hidden" name="workflowKey" value={workflow.id} />
              <input type="hidden" name="triggerType" value="manual" />
              <input type="hidden" name="idempotencyKey" value={`${workflow.id}:manual:${new Date().toISOString()}`} />
              <button className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400">Start durable run</button>
            </form>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">Latest run</h2>
              {latestRun ? <StatusBadge value={latestRun.status} /> : null}
            </div>
            {latestRun ? (
              <div className="mt-4 space-y-4 text-sm text-slate-400">
                <div className="rounded-xl border border-white/8 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-600">Run id</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-300">{latestRun.id}</p>
                  <p className="mt-3 text-xs uppercase tracking-wider text-slate-600">Idempotency</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-300">{latestRun.idempotencyKey ?? "Generated on start"}</p>
                  <p className="mt-3">Retry {latestRun.retryCount}/{latestRun.maxRetries} · {latestRun.runKind}</p>
                  {latestRun.pauseReason ? <p className="mt-2 text-amber-200">Paused: {latestRun.pauseReason}</p> : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {canPause ? (
                    <form action={transitionWorkflowRunAction}>
                      <input type="hidden" name="workflowKey" value={workflow.id} />
                      <input type="hidden" name="runId" value={latestRun.id} />
                      <input type="hidden" name="action" value="pause" />
                      <input type="hidden" name="reason" value="Manual pause requested from workflow console." />
                      <button className="w-full rounded-xl border border-amber-400/25 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/10">Pause</button>
                    </form>
                  ) : null}
                  {canResume ? (
                    <form action={transitionWorkflowRunAction}>
                      <input type="hidden" name="workflowKey" value={workflow.id} />
                      <input type="hidden" name="runId" value={latestRun.id} />
                      <input type="hidden" name="action" value="resume" />
                      <input type="hidden" name="reason" value="Manual resume requested from workflow console." />
                      <button className="w-full rounded-xl border border-emerald-400/25 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/10">Resume</button>
                    </form>
                  ) : null}
                  {canRetry ? (
                    <form action={transitionWorkflowRunAction}>
                      <input type="hidden" name="workflowKey" value={workflow.id} />
                      <input type="hidden" name="runId" value={latestRun.id} />
                      <input type="hidden" name="action" value="retry" />
                      <input type="hidden" name="reason" value="Manual retry requested from workflow console." />
                      <button className="w-full rounded-xl border border-cyan-400/25 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/10">Retry</button>
                    </form>
                  ) : null}
                  {canCancel ? (
                    <form action={transitionWorkflowRunAction}>
                      <input type="hidden" name="workflowKey" value={workflow.id} />
                      <input type="hidden" name="runId" value={latestRun.id} />
                      <input type="hidden" name="action" value="cancel" />
                      <input type="hidden" name="reason" value="Manual cancellation requested from workflow console." />
                      <button className="w-full rounded-xl border border-rose-400/25 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/10">Cancel</button>
                    </form>
                  ) : null}
                </div>
                <form action={replayWorkflowRunAction}>
                  <input type="hidden" name="workflowKey" value={workflow.id} />
                  <input type="hidden" name="runId" value={latestRun.id} />
                  <input type="hidden" name="reason" value="Manual replay requested from workflow console." />
                  <button className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/7">Replay from snapshot</button>
                </form>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-500">No durable run has been created yet. Start one to seed step records and append the first run event.</p>
            )}
          </div>
        </aside>
        <div className="space-y-6">
          {supportTriage ? (
            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/8 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">PB-025 live workflow</p>
                  <h2 className="mt-2 font-semibold text-white">Customer support intake</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                    Create a governed support case. Staffer queues a task, starts the durable workflow, classifies the request, searches approved knowledge, drafts Anna&apos;s response, routes specialist review, and opens approval before any customer-visible action.
                  </p>
                </div>
                <StatusBadge value="Approval gated" />
              </div>
              <form action={startSupportTriageAction} className="mt-6 grid gap-4 lg:grid-cols-2">
                <input type="hidden" name="workflowKey" value={workflow.id} />
                <input type="hidden" name="sourceType" value="manual" />
                <label className="text-sm text-slate-300">
                  Customer name
                  <input name="customerName" placeholder="Customer or company name" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" />
                </label>
                <label className="text-sm text-slate-300">
                  Customer email
                  <input name="customerEmail" type="email" placeholder="customer@example.com" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" />
                </label>
                <label className="text-sm text-slate-300">
                  Product area
                  <input name="productArea" placeholder="Banking application, onboarding, API..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" />
                </label>
                <label className="text-sm text-slate-300">
                  Source message id
                  <input name="sourceMessageId" placeholder="Optional idempotency key from Gmail later" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" />
                </label>
                <label className="text-sm text-slate-300 lg:col-span-2">
                  Subject
                  <input name="subject" required placeholder="Cannot access banking dashboard" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" />
                </label>
                <label className="text-sm text-slate-300 lg:col-span-2">
                  Message body
                  <textarea name="messageBody" required rows={6} placeholder="Paste the customer message here..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" />
                </label>
                <div className="lg:col-span-2">
                  <button className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                    Create governed support triage
                  </button>
                  <p className="mt-2 text-xs text-slate-500">Email sending is intentionally blocked. This creates a task, workflow run, citations, draft and approval request only.</p>
                </div>
              </form>
            </div>
          ) : null}
          {featureIntake ? (
            <div className="rounded-2xl border border-purple-400/15 bg-purple-400/8 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-purple-300">PB-026 live workflow</p>
                  <h2 className="mt-2 font-semibold text-white">Feature intake to engineering</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                    Capture a feature request and let Staffer draft the product summary, requirements, architecture options, implementation plan, QA plan, compliance review and exact GitHub issue payload. GitHub creation stays blocked until approval.
                  </p>
                </div>
                <StatusBadge value="GitHub approval gated" />
              </div>
              <form action={startFeatureIntakeAction} className="mt-6 grid gap-4 lg:grid-cols-2">
                <input type="hidden" name="workflowKey" value={workflow.id} />
                <input type="hidden" name="sourceType" value="manual" />
                <label className="text-sm text-slate-300">
                  Requester name
                  <input name="requesterName" placeholder="Founder, customer, team member" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-purple-400" />
                </label>
                <label className="text-sm text-slate-300">
                  Requester email
                  <input name="requesterEmail" type="email" placeholder="requester@example.com" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-purple-400" />
                </label>
                <label className="text-sm text-slate-300">
                  Customer segment
                  <input name="customerSegment" placeholder="Pilot customer, enterprise, internal ops..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-purple-400" />
                </label>
                <label className="text-sm text-slate-300">
                  Product area
                  <input name="productArea" placeholder="Workflow automation, approvals, mobile..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-purple-400" />
                </label>
                <label className="text-sm text-slate-300 lg:col-span-2">
                  Source reference
                  <input name="sourceReference" placeholder="Optional idempotency key from form/email later" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-purple-400" />
                </label>
                <label className="text-sm text-slate-300 lg:col-span-2">
                  Feature title
                  <input name="title" required placeholder="Add customer portal visibility for approval status" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-purple-400" />
                </label>
                <label className="text-sm text-slate-300 lg:col-span-2">
                  Product problem
                  <textarea name="problemStatement" required rows={4} placeholder="What problem does this solve and for whom?" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-purple-400" />
                </label>
                <label className="text-sm text-slate-300 lg:col-span-2">
                  Expected outcome
                  <textarea name="expectedOutcome" required rows={3} placeholder="Describe the measurable user/business outcome." className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-purple-400" />
                </label>
                <label className="text-sm text-slate-300 lg:col-span-2">
                  Evidence
                  <textarea name="evidence" rows={4} placeholder="Customer quote, support case, metric, founder note, competitor signal..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-purple-400" />
                </label>
                <div className="lg:col-span-2">
                  <button className="rounded-xl bg-purple-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-purple-300">
                    Create governed feature intake
                  </button>
                  <p className="mt-2 text-xs text-slate-500">GitHub issue creation is intentionally blocked. This creates a task, workflow run, specialist package and approval request only.</p>
                </div>
              </form>
            </div>
          ) : null}
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Durable step ledger</h2>
            {latestSteps.length ? (
              <ol className="mt-5 space-y-4">
                {latestSteps.map((step) => (
                  <li key={step.id} className="flex gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-blue-400/20 bg-blue-400/8 text-xs font-semibold text-blue-300">{step.stepIndex}</span>
                    <div className="flex-1 rounded-xl border border-white/8 bg-black/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium text-slate-200">{step.stepName}</h3>
                          <p className="mt-1 text-xs text-slate-600">{step.stepType} · attempt {step.attempt}/{step.maxAttempts}</p>
                        </div>
                        <StatusBadge value={step.status} />
                      </div>
                      <p className="mt-3 break-all font-mono text-[11px] text-slate-600">{step.idempotencyKey}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-500">No step records yet. Starting a durable run will snapshot this workflow definition into idempotent step rows.</p>
            )}
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Append-only run events</h2>
            {latestEvents.length ? (
              <ol className="mt-5 space-y-4">
                {latestEvents.map((event) => (
                  <li key={event.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-medium text-slate-200">{event.title}</h3>
                      <span className="text-xs text-slate-600">{new Date(event.createdAt).toLocaleString("en-GB")}</span>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-wider text-cyan-300">{event.eventType}</p>
                    {event.body ? <p className="mt-3 text-sm leading-6 text-slate-500">{event.body}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-500">No events recorded for the latest run.</p>
            )}
          </div>
          {supportTriage ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-white">Recent support triage cases</h2>
                <span className="text-xs text-slate-500">{supportTriage.cases.length} shown</span>
              </div>
              {supportTriage.cases.length ? (
                <div className="mt-5 space-y-4">
                  {supportTriage.cases.map((supportCase) => (
                    <article key={supportCase.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium text-slate-200">{supportCase.subject}</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {supportCase.customerName ?? "Unknown customer"} {supportCase.customerEmail ? `· ${supportCase.customerEmail}` : ""} · {new Date(supportCase.createdAt).toLocaleString("en-GB")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge value={supportCase.severity} />
                          <StatusBadge value={supportCase.externalActionStatus} />
                        </div>
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-slate-600">Category</dt>
                          <dd className="mt-1 text-slate-300">{supportCase.category.replace(/_/g, " ")}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-slate-600">Escalation</dt>
                          <dd className="mt-1 text-slate-300">{supportCase.escalationTargets.join(", ") || "anna"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-slate-600">SLA</dt>
                          <dd className="mt-1 text-slate-300">{supportCase.slaTargetAt ? new Date(supportCase.slaTargetAt).toLocaleString("en-GB") : "Not set"}</dd>
                        </div>
                      </dl>
                      {supportCase.draftResponse ? (
                        <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.03] p-3">
                          <p className="text-xs uppercase tracking-wider text-slate-600">Approval-gated draft</p>
                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-400">{supportCase.draftResponse}</p>
                        </div>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                        {supportCase.taskReference ? <Link href={`/tasks/${supportCase.taskReference}`} className="text-blue-300 hover:text-blue-200">Open task</Link> : null}
                        {supportCase.approvalId ? <Link href={`/approvals/${supportCase.approvalId}`} className="text-cyan-300 hover:text-cyan-200">Review approval</Link> : null}
                        <span className="text-slate-600">{supportCase.citations.length} citations</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">No live support triage cases yet. Use the intake form to create the first approval-gated support workflow.</p>
              )}
            </div>
          ) : null}
          {featureIntake ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-white">Recent feature intake packages</h2>
                <span className="text-xs text-slate-500">{featureIntake.requests.length} shown</span>
              </div>
              {featureIntake.requests.length ? (
                <div className="mt-5 space-y-4">
                  {featureIntake.requests.map((request) => (
                    <article key={request.id} className="rounded-xl border border-white/8 bg-black/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium text-slate-200">{request.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {request.requesterName ?? "Unknown requester"} {request.productArea ? `· ${request.productArea}` : ""} · {new Date(request.createdAt).toLocaleString("en-GB")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge value={request.priority} />
                          <StatusBadge value={request.status} />
                        </div>
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-slate-600">Nancy</dt>
                          <dd className="mt-1 text-slate-300">{String(request.nancySummary.problem ?? request.problemStatement).slice(0, 90)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-slate-600">Mobola</dt>
                          <dd className="mt-1 text-slate-300">{summarizeArtifact(request.mobolaRequirements).slice(0, 120)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-slate-600">Raj</dt>
                          <dd className="mt-1 text-slate-300">{summarizeArtifact(request.rajDeliveryPlan).slice(0, 120)}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.03] p-3">
                        <p className="text-xs uppercase tracking-wider text-slate-600">Approval-gated GitHub issue</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{String(request.githubIssuePayload.title ?? "Draft GitHub issue payload")}</p>
                        <p className="mt-1 text-xs text-slate-600">{String(request.githubIssuePayload.repository ?? "Repository configured in settings")}</p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                        {request.taskReference ? <Link href={`/tasks/${request.taskReference}`} className="text-blue-300 hover:text-blue-200">Open task</Link> : null}
                        {request.approvalId ? <Link href={`/approvals/${request.approvalId}`} className="text-cyan-300 hover:text-cyan-200">Review approval</Link> : null}
                        <span className="text-slate-600">Risk {request.riskClass}/5</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">No live feature intake packages yet. Use the intake form to create the first approval-gated engineering request.</p>
              )}
            </div>
          ) : null}
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Dry-run reference</h2>
            <ol className="mt-5 space-y-4">
              {dryRun.map((event, index) => (
                <li key={`${event.label}-${index}`} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-slate-400/20 bg-white/5 text-xs font-semibold text-slate-300">{index + 1}</span>
                  <div className="rounded-xl border border-white/8 bg-black/10 p-4">
                    <h3 className="font-medium text-slate-200">{event.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{event.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
