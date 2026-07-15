import { PageHeading } from "@/components/page-heading";

const integrations = ["Gmail", "Google Calendar", "GitHub", "Vercel", "Supabase", "Slack", "CRM", "Document Storage"];

export default function IntegrationsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Integrations"
        title="Give agents tools, never unrestricted access."
        description="Connections should use narrow, audited actions. Each agent receives only the tools required by its role."
      />
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
