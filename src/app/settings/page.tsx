import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { createInvitationAction, storeIntegrationSecretAction, updateOrganisationSettingsAction } from "@/app/settings/actions";
import { getCurrentMembership, isDemoMode } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type OrganisationRow = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  settings: {
    approval_mode?: string;
    default_autonomy_level?: number;
    default_maximum_steps?: number;
    default_maximum_cost_usd?: number;
    default_input_token_limit?: number;
    default_output_token_limit?: number;
  } | null;
};

type MembershipRow = {
  user_id: string;
  role: string;
  created_at: string;
};

type InvitationRow = {
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
};

type IntegrationSecretRow = {
  integration_key: string;
  display_name: string;
  secret_label: string;
  key_version: string;
  updated_at: string;
};

async function getSettingsData() {
  if (isDemoMode()) {
    return {
      organisation: null,
      membershipRole: null,
      members: [] as MembershipRow[],
      invitations: [] as InvitationRow[],
      secrets: [] as IntegrationSecretRow[],
    };
  }

  const supabase = await getSupabaseServerClient();
  const membership = await getCurrentMembership();

  if (!supabase || !membership?.organisation_id) {
    return {
      organisation: null,
      membershipRole: null,
      members: [] as MembershipRow[],
      invitations: [] as InvitationRow[],
      secrets: [] as IntegrationSecretRow[],
    };
  }

  const [organisationResult, membersResult, invitationsResult, secretsResult] = await Promise.all([
    supabase.schema("staffer").from("organisations").select("id, name, slug, timezone, settings").eq("id", membership.organisation_id).maybeSingle(),
    supabase.schema("staffer").from("memberships").select("user_id, role, created_at").eq("organisation_id", membership.organisation_id).order("created_at"),
    supabase
      .schema("staffer")
      .from("organisation_invitations")
      .select("email, role, status, expires_at, created_at")
      .eq("organisation_id", membership.organisation_id)
      .order("created_at", { ascending: false }),
    supabase
      .schema("staffer")
      .from("integration_secrets")
      .select("integration_key, display_name, secret_label, key_version, updated_at")
      .eq("organisation_id", membership.organisation_id)
      .order("updated_at", { ascending: false }),
  ]);

  return {
    organisation: (organisationResult.data ?? null) as OrganisationRow | null,
    membershipRole: String(membership.role),
    members: (membersResult.data ?? []) as MembershipRow[],
    invitations: (invitationsResult.data ?? []) as InvitationRow[],
    secrets: (secretsResult.data ?? []) as IntegrationSecretRow[],
  };
}

const settings = [
  { label: "Application", value: publicEnv.NEXT_PUBLIC_APP_NAME },
  { label: "Company", value: publicEnv.NEXT_PUBLIC_COMPANY_NAME },
  { label: "Demo mode", value: publicEnv.NEXT_PUBLIC_DEMO_MODE },
  { label: "App URL", value: publicEnv.NEXT_PUBLIC_APP_URL ?? "Not configured" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; invite?: string }>;
}) {
  const params = await searchParams;
  const data = await getSettingsData();
  const isAdmin = data.membershipRole === "founder" || data.membershipRole === "administrator";

  return (
    <>
      <PageHeading
        eyebrow="Settings"
        title="Foundation and identity controls."
        description="Manage tenant settings, membership invitations and encrypted integration secrets without editing code."
      />

      {params.error ? <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-5 text-sm text-rose-100">{params.error}</div> : null}
      {params.message ? <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5 text-sm text-emerald-100">{params.message}</div> : null}
      {params.invite ? (
        <div className="mb-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/8 p-5 text-sm leading-6 text-cyan-50">
          <p className="font-semibold">Invitation link</p>
          <p className="mt-2 break-all font-mono text-xs text-cyan-100">{params.invite}</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold">Public configuration</h2>
          <div className="mt-5 space-y-4">
            {settings.map((setting) => (
              <div key={setting.label} className="flex items-center justify-between gap-4 rounded-xl border border-white/7 bg-black/10 p-4">
                <span className="text-sm text-slate-500">{setting.label}</span>
                <span className="break-all text-right font-mono text-xs text-slate-300">{setting.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold">Organisation settings</h2>
          {data.organisation || isDemoMode() ? (
            <form action={updateOrganisationSettingsAction} className="mt-5 space-y-4">
              <label className="block text-sm text-slate-400">
                Organisation name
                <input
                  name="name"
                  defaultValue={data.organisation?.name ?? publicEnv.NEXT_PUBLIC_COMPANY_NAME}
                  disabled={!isAdmin && !isDemoMode()}
                  required
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="block text-sm text-slate-400">
                Timezone
                <input
                  name="timezone"
                  defaultValue={data.organisation?.timezone ?? "Europe/London"}
                  disabled={!isAdmin && !isDemoMode()}
                  required
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="block text-sm text-slate-400">
                Approval mode
                <select
                  name="approvalMode"
                  defaultValue={data.organisation?.settings?.approval_mode ?? "default"}
                  disabled={!isAdmin && !isDemoMode()}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="default">Default governed approvals</option>
                  <option value="strict">Strict approvals for all protected actions</option>
                  <option value="demo_safe">Demo-safe no external execution</option>
                </select>
              </label>
              <div className="rounded-2xl border border-white/8 bg-black/10 p-5">
                <h3 className="font-semibold text-slate-200">Default agent guardrails</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Blank values stay unset and let each agent or runtime policy decide. These defaults are tenant settings, not hardcoded execution rules.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block text-sm text-slate-400">
                    Default autonomy level
                    <select
                      name="defaultAutonomyLevel"
                      defaultValue={data.organisation?.settings?.default_autonomy_level ?? ""}
                      disabled={!isAdmin && !isDemoMode()}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">Unset</option>
                      {[0, 1, 2, 3, 4, 5].map((level) => (
                        <option key={level} value={level}>
                          Level {level}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-400">
                    Default maximum steps
                    <input
                      name="defaultMaximumSteps"
                      type="number"
                      min={1}
                      defaultValue={data.organisation?.settings?.default_maximum_steps}
                      disabled={!isAdmin && !isDemoMode()}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                  <label className="block text-sm text-slate-400">
                    Default maximum cost USD
                    <input
                      name="defaultMaximumCostUsd"
                      type="number"
                      min={0}
                      step="0.0001"
                      defaultValue={data.organisation?.settings?.default_maximum_cost_usd}
                      disabled={!isAdmin && !isDemoMode()}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                  <label className="block text-sm text-slate-400">
                    Default input token limit
                    <input
                      name="defaultInputTokenLimit"
                      type="number"
                      min={1}
                      defaultValue={data.organisation?.settings?.default_input_token_limit}
                      disabled={!isAdmin && !isDemoMode()}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                  <label className="block text-sm text-slate-400 md:col-span-2">
                    Default output token limit
                    <input
                      name="defaultOutputTokenLimit"
                      type="number"
                      min={1}
                      defaultValue={data.organisation?.settings?.default_output_token_limit}
                      disabled={!isAdmin && !isDemoMode()}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                </div>
              </div>
              <button disabled={!isAdmin && !isDemoMode()} type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">
                Save settings
              </button>
            </form>
          ) : (
            <EmptyState title="No organisation yet" description="Create an organisation through onboarding before live settings can be edited." actionHref="/onboarding" actionLabel="Go to onboarding" />
          )}
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold">Invite a user</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Creates a one-time invitation link. External email sending remains manual until an approved email tool exists.</p>
          <form action={createInvitationAction} className="mt-5 space-y-4">
            <label className="block text-sm text-slate-400">
              Email
              <input name="email" type="email" disabled={!isAdmin && !isDemoMode()} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60" />
            </label>
            <label className="block text-sm text-slate-400">
              Role
              <select name="role" disabled={!isAdmin && !isDemoMode()} defaultValue="viewer" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60">
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="reviewer">Reviewer</option>
                <option value="administrator">Administrator</option>
              </select>
            </label>
            <button disabled={!isAdmin && !isDemoMode()} type="submit" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7 disabled:cursor-not-allowed disabled:opacity-60">
              Create invitation
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold">Encrypted integration secret</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Secrets are encrypted in a server action before storage. The plaintext is never rendered back to the browser.</p>
          <form action={storeIntegrationSecretAction} className="mt-5 space-y-4">
            <label className="block text-sm text-slate-400">
              Display name
              <input name="displayName" disabled={!isAdmin && !isDemoMode()} placeholder="Internal service credential" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60" />
            </label>
            <label className="block text-sm text-slate-400">
              Integration key
              <input name="integrationKey" disabled={!isAdmin && !isDemoMode()} placeholder="internal-service" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60" />
            </label>
            <label className="block text-sm text-slate-400">
              Secret label
              <input name="secretLabel" disabled={!isAdmin && !isDemoMode()} defaultValue="api-key" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60" />
            </label>
            <label className="block text-sm text-slate-400">
              Secret value
              <input name="secretValue" disabled={!isAdmin && !isDemoMode()} type="password" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60" />
            </label>
            <button disabled={!isAdmin && !isDemoMode()} type="submit" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7 disabled:cursor-not-allowed disabled:opacity-60">
              Store encrypted secret
            </button>
          </form>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold">Members</h2>
          <div className="mt-5 space-y-3">
            {data.members.length ? (
              data.members.map((member) => (
                <div key={`${member.user_id}-${member.role}`} className="rounded-xl border border-white/7 bg-black/10 p-4">
                  <p className="break-all font-mono text-xs text-slate-300">{member.user_id}</p>
                  <p className="mt-2 text-sm text-slate-500">{member.role}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-slate-500">Demo mode or no visible members yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold">Invitations</h2>
          <div className="mt-5 space-y-3">
            {data.invitations.length ? (
              data.invitations.map((invite) => (
                <div key={`${invite.email}-${invite.created_at}`} className="rounded-xl border border-white/7 bg-black/10 p-4">
                  <p className="text-sm text-slate-300">{invite.email}</p>
                  <p className="mt-2 text-xs text-slate-500">{invite.role} · {invite.status} · expires {new Date(invite.expires_at).toLocaleDateString("en-GB")}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-slate-500">No live invitations yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <h2 className="font-semibold">Stored secret metadata</h2>
          <div className="mt-5 space-y-3">
            {data.secrets.length ? (
              data.secrets.map((secret) => (
                <div key={`${secret.integration_key}-${secret.secret_label}`} className="rounded-xl border border-white/7 bg-black/10 p-4">
                  <p className="text-sm text-slate-300">{secret.display_name}</p>
                  <p className="mt-2 font-mono text-xs text-slate-500">{secret.integration_key}:{secret.secret_label} · {secret.key_version}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-slate-500">No encrypted live secrets stored yet.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
