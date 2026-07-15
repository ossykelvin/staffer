import { agents, approvals, tasks, workflows } from "@/lib/data";
import type { ApprovalRecord, TaskRecord, WorkflowDefinition } from "@/lib/types";

export function getTaskById(id: string) {
  return tasks.find((task) => task.id === id);
}

export function getApprovalById(id: string) {
  return approvals.find((approval) => approval.id === id);
}

export function getWorkflowById(id: string) {
  return workflows.find((workflow) => workflow.id === id);
}

export function getTaskDetail(task: TaskRecord) {
  const owner = agents.find((agent) => agent.name === task.owner);
  const needsApproval = task.status.toLowerCase().includes("approval") || task.priority.toLowerCase() === "critical";

  return {
    owner,
    description: `${task.title} is staged as demo work for ${task.project}. The live version will store task state, comments, dependencies, evidence, and approvals in tenant-aware repositories.`,
    approvalPath: needsApproval ? "Human approval required before protected execution" : "Owner review before completion",
    nextAction: needsApproval ? "Open the approval centre and inspect the matching request." : "Review evidence and move the task forward when live mutations exist.",
    evidence: [
      "Demo task record validated from seed data",
      "Approval boundary retained until live audit exists",
      "No external or production action can execute from this view",
    ],
    activity: [
      { actor: "System", event: "Task imported from demo seed data", when: "Demo setup" },
      { actor: task.owner, event: `Assigned as accountable owner for ${task.project}`, when: task.due },
      { actor: "Governance", event: needsApproval ? "Approval gate detected" : "Review gate detected", when: "Current state" },
    ],
  };
}

export function getApprovalDetail(approval: ApprovalRecord) {
  return {
    summary: `${approval.requester} requested a governed decision for ${approval.type.toLowerCase()}. This demo view shows the review surface without executing the protected action.`,
    evidence: [
      "Requester, risk level, and action type identified",
      "Exact payload placeholder visible before decision",
      "Decision controls are demo-only until audit logging exists",
    ],
    payload: {
      approvalId: approval.id,
      actionType: approval.type,
      requester: approval.requester,
      executionMode: "blocked_demo_only",
    },
    history: [
      { actor: approval.requester, event: "Submitted approval request", when: approval.submitted },
      { actor: "Staffer", event: "Classified protected action and held execution", when: "Current state" },
    ],
  };
}

export function getWorkflowDryRun(workflow: WorkflowDefinition) {
  const firstThreeSteps = workflow.steps.slice(0, 3).map((step, index) => ({
    label: step,
    detail: `Step ${index + 1} prepares demo evidence only.`,
  }));

  return [
    { label: "Trigger received", detail: workflow.trigger },
    { label: "Task created", detail: "A queued task would be created with idempotency and tenant scope." },
    ...firstThreeSteps,
    { label: "Review gate", detail: workflow.approval },
    { label: "Protected action blocked", detail: "Live execution waits for approval verification and audit logging." },
    { label: "Audit event planned", detail: "The final live system will record every state change and decision." },
  ];
}
