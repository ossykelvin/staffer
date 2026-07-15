import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { publicEnv } from "@/lib/env";

const settings = [
  { label: "Application", value: publicEnv.NEXT_PUBLIC_APP_NAME },
  { label: "Organisation", value: publicEnv.NEXT_PUBLIC_COMPANY_NAME },
  { label: "Demo mode", value: publicEnv.NEXT_PUBLIC_DEMO_MODE },
  { label: "Primary colour", value: publicEnv.NEXT_PUBLIC_PRIMARY_COLOR },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        title="Configuration without code edits."
        description="Branding, provider selection, thresholds, feature flags and integration credentials are loaded from environment configuration or database settings."
      />
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
          <h2 className="font-semibold">Implementation status</h2>
          <ul className="mt-5 space-y-4 text-sm text-slate-400">
            <li>Done: environment schema and validated demo config</li>
            <li>Done: provider adapter scaffold</li>
            <li>Done: Supabase SSR client scaffold</li>
            <li>Next: authentication and organisation onboarding</li>
            <li>Next: live provider execution and cost controls</li>
            <li>Next: durable workflows and scheduled jobs</li>
          </ul>
          <div className="mt-6 rounded-xl border border-cyan-400/10 bg-cyan-400/5 p-4 text-xs leading-5 text-slate-400">
            <p>Use the backlog to implement one governed slice at a time.</p>
            <Link href="/workflows" className="mt-3 inline-flex font-semibold text-cyan-300">
              Review workflow dry-runs -&gt;
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
