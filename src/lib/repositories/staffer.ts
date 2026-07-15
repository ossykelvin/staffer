import { agents as demoAgents, approvals as demoApprovals, tasks as demoTasks, workflows as demoWorkflows } from "@/lib/data";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AgentProfile, AgentSkill, AgentTool, AgentVersion, ApprovalRecord, TaskRecord, WorkflowDefinition } from "@/lib/types";

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

function asOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asProfile(record: JsonRecord) {
  return (record.profile && typeof record.profile === "object" ? record.profile : {}) as JsonRecord;
}

function asNestedRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as JsonRecord;
}

function mapAgentSkill(record: JsonRecord): AgentSkill | null {
  const skill = asNestedRecord(record.skills);
  if (!skill) {
    return null;
  }

  return {
    id: typeof skill.id === "string" ? skill.id : undefined,
    key: String(skill.key ?? skill.id),
    name: String(skill.name ?? skill.key ?? "Unnamed skill"),
    description: typeof skill.description === "string" ? skill.description : undefined,
    proficiency: typeof record.proficiency === "number" ? record.proficiency : undefined,
  };
}

function asJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mapAgentTool(record: JsonRecord): AgentTool | null {
  const tool = asNestedRecord(record.tools);
  if (!tool) {
    return null;
  }

  return {
    id: typeof tool.id === "string" ? tool.id : undefined,
    key: String(tool.key ?? tool.id),
    name: String(tool.name ?? tool.key ?? "Unnamed tool"),
    description: typeof tool.description === "string" ? tool.description : undefined,
    riskClass: Number(tool.risk_class ?? 1),
    requiresApproval: Boolean(tool.requires_approval),
    isActive: tool.is_active !== false,
    constraints: asJsonObject(record.constraints),
  };
}

function mapAgent(record: JsonRecord): AgentProfile {
  const profile = asProfile(record);
  const skillDetails = Array.isArray(record.agent_skills)
    ? record.agent_skills.map((item) => mapAgentSkill(item as JsonRecord)).filter((item): item is AgentSkill => Boolean(item))
    : [];
  const toolDetails = Array.isArray(record.agent_tools)
    ? record.agent_tools.map((item) => mapAgentTool(item as JsonRecord)).filter((item): item is AgentTool => Boolean(item))
    : [];
  const skills = skillDetails.length ? skillDetails.map((skill) => skill.name) : asStringArray(profile.skills);
  const tools = toolDetails.length ? toolDetails.map((tool) => tool.key) : asStringArray(profile.tools);

  return {
    id: String(record.key ?? record.id),
    databaseId: typeof record.id === "string" ? record.id : undefined,
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
    version: typeof record.version === "number" ? record.version : 1,
    primaryModel: typeof record.primary_model === "string" ? record.primary_model : undefined,
    fallbackModel: typeof record.fallback_model === "string" ? record.fallback_model : undefined,
    maximumSteps: asOptionalNumber(record.maximum_steps),
    maximumCostUsd: asOptionalNumber(record.maximum_cost_usd),
    maximumInputTokens: asOptionalNumber(record.maximum_input_tokens),
    maximumOutputTokens: asOptionalNumber(record.maximum_output_tokens),
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
    skills,
    skillDetails,
    tools,
    toolDetails,
    requiresApproval: asStringArray(profile.requiresApproval),
    prohibitedActions: asStringArray(record.prohibited_actions),
    approvalRules: asStringArray(record.approval_rules),
  };
}

function mapSkill(record: JsonRecord): AgentSkill {
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    key: String(record.key ?? record.id),
    name: String(record.name ?? record.key ?? "Unnamed skill"),
    description: typeof record.description === "string" ? record.description : undefined,
  };
}

function mapTool(record: JsonRecord): AgentTool {
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    key: String(record.key ?? record.id),
    name: String(record.name ?? record.key ?? "Unnamed tool"),
    description: typeof record.description === "string" ? record.description : undefined,
    riskClass: Number(record.risk_class ?? 1),
    requiresApproval: Boolean(record.requires_approval),
    isActive: record.is_active !== false,
  };
}

function mapAgentVersion(record: JsonRecord): AgentVersion {
  return {
    id: String(record.id),
    agentId: String(record.agent_id),
    version: Number(record.version ?? 1),
    changeSummary: String(record.change_summary ?? "Agent profile version recorded."),
    createdBy: typeof record.created_by === "string" ? record.created_by : undefined,
    createdAt: String(record.created_at ?? new Date().toISOString()),
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
    .select("*, agent_skills(proficiency, skills(id, key, name, description)), agent_tools(constraints, tools(id, key, name, description, risk_class, requires_approval, is_active))")
    .eq("organisation_id", context.organisationId)
    .order("name");

  return error || !data ? demoAgents : data.map((record) => mapAgent(record as JsonRecord));
}

export async function getAgentById(id: string) {
  const allAgents = await getAgents();
  return allAgents.find((agent) => agent.id === id);
}

export async function getSkills() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    const skills = new Map<string, AgentSkill>();

    for (const agent of demoAgents) {
      for (const skill of agent.skills) {
        const key = skill.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        skills.set(key, { key, name: skill });
      }
    }

    return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("skills")
    .select("id, key, name, description")
    .eq("organisation_id", context.organisationId)
    .order("name");

  return error || !data ? [] : data.map((record) => mapSkill(record as JsonRecord));
}

export async function getTools() {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    const tools = new Map<string, AgentTool>();

    for (const agent of demoAgents) {
      for (const tool of agent.tools) {
        tools.set(tool, {
          key: tool,
          name: titleCase(tool),
          riskClass: agent.requiresApproval.some((boundary) => boundary.toLowerCase().includes(tool.toLowerCase())) ? 3 : 1,
          requiresApproval: false,
          isActive: true,
        });
      }
    }

    return [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("tools")
    .select("id, key, name, description, risk_class, requires_approval, is_active")
    .eq("organisation_id", context.organisationId)
    .order("name");

  return error || !data ? [] : data.map((record) => mapTool(record as JsonRecord));
}

export async function getAgentVersions(agentId: string) {
  const context = await getLiveContext();
  if (!context?.organisationId) {
    const agent = demoAgents.find((item) => item.id === agentId);
    return agent
      ? [
          {
            id: `${agent.id}-v1`,
            agentId: agent.id,
            version: agent.version ?? 1,
            changeSummary: "Seed profile loaded for demo mode.",
            createdAt: new Date().toISOString(),
          },
        ]
      : [];
  }

  const { data: agent } = await context.supabase
    .schema("staffer")
    .from("agents")
    .select("id")
    .eq("organisation_id", context.organisationId)
    .eq("key", agentId)
    .maybeSingle();

  if (!agent?.id) {
    return [];
  }

  const { data, error } = await context.supabase
    .schema("staffer")
    .from("agent_versions")
    .select("id, agent_id, version, change_summary, created_by, created_at")
    .eq("organisation_id", context.organisationId)
    .eq("agent_id", agent.id)
    .order("version", { ascending: false });

  return error || !data ? [] : data.map((record) => mapAgentVersion(record as JsonRecord));
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
