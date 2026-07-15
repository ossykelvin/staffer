import { agents as demoAgents, approvals as demoApprovals, tasks as demoTasks, workflows as demoWorkflows } from "@/lib/data";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AgentProfile, ApprovalRecord, TaskRecord, WorkflowDefinition } from "@/lib/types";

type JsonRecord = Record<string, unknown>;

const priorityLabels = ["Low", "Medium", "High", "High", "Critical"];

function isDemoMode() {
  return publicEnv.NEXT_PUBLIC_DEMO_MODE === "true";
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function asProfile(record: JsonRecord) {
  return (record.profile && typeof record.profile === "object" ? record.profile : {}) as JsonRecord;
}

function mapAgent(record: JsonRecord): AgentProfile {
  const profile = asProfile(record);

  return {
    id: String(record.key ?? record.id),
    name: String(record.name ?? "Unnamed agent"),
    jobTitle: String(record.job_title ?? profile.jobTitle ?? "Agent"),
    department: String(record.department ?? profile.department ?? "Operations"),
    pronouns: String(profile.pronouns ?? "they/them"),
    location: String(profile.location ?? "Configured by organisation"),
    timezone: String(profile.timezone ?? "Configured by organisation"),
    age: typeof profile.age === "number" ? profile.age : undefined,
    experienceYears: typeof profile.experienceYears === "number" ? profile.experienceYears : 0,
    status: String(record.status ?? "draft"),
    profileStatus: String(profile.profileStatus ?? "live"),
    autonomyLevel: Number(record.autonomy_level ?? 1),
    initials: String(profile.initials ?? String(record.name ?? "A").slice(0, 2).toUpperCase()),
    accent: String(profile.accent ?? "blue"),
    avatarPath: typeof profile.avatarPath === "string" ? profile.avatarPath : undefined,
    avatarStyle: typeof profile.avatarStyle === "string" ? profile.avatarStyle : undefined,
    summary: String(record.biography ?? profile.summary ?? "Live agent profile."),
    personality: asStringArray(profile.personality),
    communicationStyle: String(profile.communicationStyle ?? "Configured by organisation"),
    background: typeof profile.background === "string" ? profile.background : undefined,
    personalDetail: typeof profile.personalDetail === "string" ? profile.personalDetail : undefined,
    signatureHabit: typeof profile.signatureHabit === "string" ? profile.signatureHabit : undefined,
    skills: asStringArray(profile.skills),
    tools: asStringArray(profile.tools),
    requiresApproval: asStringArray(profile.requiresApproval),
  };
}

function mapTask(record: JsonRecord): TaskRecord {
  const priority = typeof record.priority === "number" ? priorityLabels[record.priority] ?? "Medium" : String(record.priority ?? "Medium");

  return {
    id: String(record.reference ?? record.id),
    title: String(record.title ?? "Untitled task"),
    owner: String(record.owner ?? "Unassigned"),
    priority,
    status: titleCase(String(record.status ?? "draft")),
    due: record.due_at ? new Date(String(record.due_at)).toLocaleDateString("en-GB") : "Unscheduled",
    project: String(record.project_key ?? "Staffer"),
  };
}

function mapWorkflow(record: JsonRecord): WorkflowDefinition {
  const definition = (record.definition && typeof record.definition === "object" ? record.definition : {}) as JsonRecord;

  return {
    id: String(record.key ?? record.id),
    name: String(record.name ?? "Untitled workflow"),
    department: String(definition.department ?? "Operations"),
    trigger: String(definition.trigger ?? record.description ?? "Manual trigger"),
    status: String(record.status ?? "draft"),
    steps: asStringArray(definition.steps),
    approval: String(definition.approval ?? "Configured by workflow policy"),
    sla: String(definition.sla ?? "Configured by organisation"),
  };
}

function mapApproval(record: JsonRecord): ApprovalRecord {
  const riskClass = typeof record.risk_class === "number" ? record.risk_class : 1;
  const risk = riskClass >= 4 ? "Critical" : riskClass >= 3 ? "High" : riskClass >= 2 ? "Medium" : "Low";

  return {
    id: String(record.id),
    title: String(record.action_key ?? "Approval request"),
    requester: String(record.requested_by_user_id ?? record.requested_by_agent_id ?? "Unknown requester"),
    type: String(record.action_key ?? "Protected action"),
    risk,
    submitted: record.created_at ? new Date(String(record.created_at)).toLocaleString("en-GB") : "Pending",
  };
}

async function getLiveContext() {
  if (isDemoMode()) {
    return null;
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: membership } = await supabase
    .schema("staffer")
    .from("memberships")
    .select("organisation_id, role")
    .limit(1)
    .maybeSingle();

  if (!membership?.organisation_id) {
    return { supabase, user, organisationId: null as string | null };
  }

  return { supabase, user, organisationId: String(membership.organisation_id) };
}

export async function getAgents() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoAgents;
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("agents")
    .select("*")
    .eq("organisation_id", context.organisationId)
    .order("name");

  return error || !data ? demoAgents : data.map((record) => mapAgent(record as JsonRecord));
}

export async function getAgentById(id: string) {
  const allAgents = await getAgents();
  return allAgents.find((agent) => agent.id === id);
}

export async function getTasks() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoTasks;
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("tasks")
    .select("*")
    .eq("organisation_id", context.organisationId)
    .order("created_at", { ascending: false });

  return error || !data ? demoTasks : data.map((record) => mapTask(record as JsonRecord));
}

export async function getTaskById(id: string) {
  const allTasks = await getTasks();
  return allTasks.find((task) => task.id === id);
}

export async function getWorkflows() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoWorkflows;
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("workflows")
    .select("*")
    .eq("organisation_id", context.organisationId)
    .order("name");

  return error || !data ? demoWorkflows : data.map((record) => mapWorkflow(record as JsonRecord));
}

export async function getWorkflowById(id: string) {
  const allWorkflows = await getWorkflows();
  return allWorkflows.find((workflow) => workflow.id === id);
}

export async function getApprovals() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    return demoApprovals;
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("approvals")
    .select("*")
    .eq("organisation_id", context.organisationId)
    .order("created_at", { ascending: false });

  return error || !data ? demoApprovals : data.map((record) => mapApproval(record as JsonRecord));
}

export async function getApprovalById(id: string) {
  const allApprovals = await getApprovals();
  return allApprovals.find((approval) => approval.id === id);
}

export async function getDashboardData() {
  const [agents, tasks, approvals, workflows] = await Promise.all([getAgents(), getTasks(), getApprovals(), getWorkflows()]);

  return { agents, tasks, approvals, workflows };
}
