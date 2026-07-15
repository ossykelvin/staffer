import type { AgentProfile } from "@/lib/types";

type AgentProfileFormProps = {
  agent?: AgentProfile;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
};

function listValue(items?: string[]) {
  return items?.join("\n") ?? "";
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block text-sm text-slate-400">
      {label}
      <input
        name={name}
        type={type}
        min={min}
        max={max}
        defaultValue={defaultValue}
        required={required}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  required,
  rows = 4,
  help,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  rows?: number;
  help?: string;
}) {
  return (
    <label className="block text-sm text-slate-400">
      {label}
      {help ? <span className="mt-1 block text-xs text-slate-600">{help}</span> : null}
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        required={required}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
      />
    </label>
  );
}

export function AgentProfileForm({ agent, action, submitLabel }: AgentProfileFormProps) {
  return (
    <form action={action} className="space-y-5">
      {agent ? <input type="hidden" name="originalKey" value={agent.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Agent key" name="key" defaultValue={agent?.id} required />
        <Field label="Name" name="name" defaultValue={agent?.name} required />
        <Field label="Job title" name="jobTitle" defaultValue={agent?.jobTitle} required />
        <Field label="Department" name="department" defaultValue={agent?.department} required />
        <Field label="Pronouns" name="pronouns" defaultValue={agent?.pronouns ?? "they/them"} />
        <Field label="Location" name="location" defaultValue={agent?.location} />
        <Field label="Timezone" name="timezone" defaultValue={agent?.timezone} />
        <Field label="Experience years" name="experienceYears" type="number" min={0} defaultValue={agent?.experienceYears ?? 0} />
        <Field label="Initials" name="initials" defaultValue={agent?.initials} />
        <Field label="Accent" name="accent" defaultValue={agent?.accent ?? "blue"} />
        <Field label="Avatar path" name="avatarPath" defaultValue={agent?.avatarPath} />
        <Field label="Avatar style" name="avatarStyle" defaultValue={agent?.avatarStyle} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm text-slate-400">
          Status
          <select
            name="status"
            defaultValue={agent?.status ?? "draft"}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="retired">Retired</option>
          </select>
        </label>
        <label className="block text-sm text-slate-400">
          Profile status
          <select
            name="profileStatus"
            defaultValue={agent?.profileStatus ?? "draft"}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
          >
            <option value="draft">Draft</option>
            <option value="founder_confirmed">Founder confirmed</option>
            <option value="needs_review">Needs review</option>
          </select>
        </label>
        <label className="block text-sm text-slate-400">
          Autonomy level
          <select
            name="autonomyLevel"
            defaultValue={agent?.autonomyLevel ?? 1}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
          >
            {[0, 1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                Level {level}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="rounded-2xl border border-white/8 bg-black/10 p-5">
        <h3 className="font-semibold text-slate-200">Runtime routing and limits</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Leave fields blank to use organisation or database defaults. Model identifiers are stored as mutable configuration, not hardcoded in UI logic.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Primary model key" name="primaryModel" defaultValue={agent?.primaryModel} />
          <Field label="Fallback model key" name="fallbackModel" defaultValue={agent?.fallbackModel} />
          <Field label="Maximum steps" name="maximumSteps" type="number" min={1} defaultValue={agent?.maximumSteps} />
          <Field label="Maximum cost USD" name="maximumCostUsd" type="number" min={0} defaultValue={agent?.maximumCostUsd} />
          <Field label="Maximum input tokens" name="maximumInputTokens" type="number" min={1} defaultValue={agent?.maximumInputTokens} />
          <Field label="Maximum output tokens" name="maximumOutputTokens" type="number" min={1} defaultValue={agent?.maximumOutputTokens} />
        </div>
      </section>

      <TextArea label="Biography / summary" name="summary" defaultValue={agent?.summary} required />
      <TextArea label="Personality traits" name="personality" defaultValue={listValue(agent?.personality)} help="One per line or comma-separated." />
      <TextArea label="Communication style" name="communicationStyle" defaultValue={agent?.communicationStyle} required rows={3} />
      <TextArea label="Background" name="background" defaultValue={agent?.background} />
      <TextArea label="Human detail" name="personalDetail" defaultValue={agent?.personalDetail} rows={3} />
      <TextArea label="Working habit" name="signatureHabit" defaultValue={agent?.signatureHabit} rows={3} />
      <TextArea label="Legacy permitted tool notes" name="tools" defaultValue={listValue(agent?.tools)} help="One per line or comma-separated. Enforced permissions are managed through the tool catalogue mappings." />
      <TextArea label="Approval boundaries" name="requiresApproval" defaultValue={listValue(agent?.requiresApproval)} />
      <TextArea label="Prohibited actions" name="prohibitedActions" defaultValue={listValue(agent?.prohibitedActions)} help="One per line or comma-separated. These are explicit actions the agent cannot perform." />
      <TextArea label="Approval rules" name="approvalRules" defaultValue={listValue(agent?.approvalRules)} help="One per line or comma-separated. These are evaluated before protected actions." />
      {agent ? <TextArea label="Change summary" name="changeSummary" defaultValue="Profile edited by administrator." rows={2} required /> : null}

      <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
        {submitLabel}
      </button>
    </form>
  );
}
