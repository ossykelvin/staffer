import { PageHeading } from "@/components/page-heading";
import { getEmailConfigurationStatus } from "@/lib/email/provider";

const integrations = ["Gmail", "Google Calendar", "GitHub", "Vercel", "Supabase", "Slack", "CRM", "Document Storage"];

export default function IntegrationsPage() {
  const emailStatus = getEmailConfigurationStatus();

  return (
    <>
      <PageHeading
        eyebrow="Integrations"
        title="Give agents tools, never unrestricted access."
        description="Connections should use narrow, audited actions. Each agent receives only the tools required by its role."
      />
      <section className="mb-6 rounded-2xl border border-emerald-400/15 bg-emerald-400/8 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Transactional email</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Brevo delivery provider</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Server-only email delivery is configured through environment variables. External sends still require an approved, exact-payload execution path.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${emailStatus.apiConfigured && emailStatus.fromConfigured ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>
            {emailStatus.apiConfigured && emailStatus.fromConfigured ? "Ready" : "Needs sender"}
          </span>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/8 bg-black/10 p-4">
            <dt className="text-xs uppercase tracking-wider text-slate-600">Provider</dt>
            <dd className="mt-2 text-sm font-semibold text-slate-200">{emailStatus.provider}</dd>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/10 p-4">
            <dt className="text-xs uppercase tracking-wider text-slate-600">API key</dt>
            <dd className="mt-2 text-sm font-semibold text-slate-200">{emailStatus.apiConfigured ? "Configured" : "Missing"}</dd>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/10 p-4">
            <dt className="text-xs uppercase tracking-wider text-slate-600">SMTP fallback</dt>
            <dd className="mt-2 text-sm font-semibold text-slate-200">{emailStatus.smtpConfigured ? "Configured" : "Missing"}</dd>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/10 p-4">
            <dt className="text-xs uppercase tracking-wider text-slate-600">Sender</dt>
            <dd className="mt-2 text-sm font-semibold text-slate-200">{emailStatus.fromConfigured ? "Configured" : "Missing"}</dd>
          </div>
        </dl>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {integrations.map((item, index) => (
          <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.04] p-5">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-white/6 font-bold text-blue-300">{item.slice(0, 2).toUpperCase()}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${index < 2 ? "bg-amber-400/10 text-amber-300" : "bg-slate-400/10 text-slate-400"}`}>
                {index < 2 ? "Planned" : "Not connected"}
              </span>
            </div>
            <h2 className="mt-5 font-semibold">{item}</h2>
            <p className="mt-2 text-sm text-slate-500">Configure credentials and permission scopes through encrypted server-side settings.</p>
            <button
              type="button"
              disabled
              title="Configuration is blocked until encrypted organisation settings and permission checks exist."
              className="mt-5 cursor-not-allowed text-xs font-semibold text-slate-500"
            >
              Configure blocked
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
