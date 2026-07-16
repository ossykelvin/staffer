import Link from "next/link";
import { Icons } from "@/components/icons";
import { publicEnv } from "@/lib/env";

const navigation = [
  { href: "/", label: "Command Centre", icon: Icons.dashboard },
  { href: "/agents", label: "AI Staff", icon: Icons.agents },
  { href: "/tasks", label: "Task Board", icon: Icons.inbox },
  { href: "/workflows", label: "Workflow Studio", icon: Icons.automation },
  { href: "/approvals", label: "Approval Centre", icon: Icons.approvals },
  { href: "/knowledge", label: "Knowledge Hub", icon: Icons.knowledge },
  { href: "/governance", label: "Governance", icon: Icons.shield },
  { href: "/integrations", label: "Integrations", icon: Icons.integrations },
  { href: "/settings", label: "Settings", icon: Icons.settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#071225] text-slate-100">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_18%_8%,rgba(37,99,235,0.20),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(34,211,238,0.10),transparent_25%)]" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/8 bg-[#08152b]/95 px-5 py-6 backdrop-blur-xl lg:block">
        <Link href="/" className="flex items-center gap-3 px-2">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-950/50"><Icons.sparkles className="size-5 text-white" /></span>
          <span><span className="block text-lg font-bold tracking-tight">{publicEnv.NEXT_PUBLIC_APP_NAME}</span><span className="block text-xs text-slate-500">{publicEnv.NEXT_PUBLIC_COMPANY_NAME}</span></span>
        </Link>
        <nav className="mt-9 space-y-1.5">
          {navigation.map((item) => <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/7 hover:text-white"><item.icon className="size-4.5 transition group-hover:text-cyan-300" />{item.label}</Link>)}
        </nav>
        <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-blue-400/15 bg-gradient-to-br from-blue-500/12 to-cyan-400/5 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-200"><Icons.shield className="size-4" />Governed automation</div>
          <p className="mt-2 text-xs leading-5 text-slate-400">External actions remain approval-controlled in this first draft.</p>
        </div>
      </aside>
      <div className="relative lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-white/8 bg-[#071225]/80 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-sm font-semibold">{publicEnv.NEXT_PUBLIC_COMPANY_NAME}</p><p className="text-xs text-slate-500">{publicEnv.NEXT_PUBLIC_APP_TAGLINE}</p></div>
            <div className="flex items-center gap-3">
              <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3 py-1.5 text-xs font-medium text-emerald-300 sm:inline-flex">
                {publicEnv.NEXT_PUBLIC_DEMO_MODE === "true" ? "Demo environment" : "Live environment"}
              </span>
              {publicEnv.NEXT_PUBLIC_DEMO_MODE === "true" ? (
                <span className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/7 text-xs font-bold">ON</span>
              ) : (
                <Link href="/login" className="rounded-full border border-white/10 bg-white/7 px-3 py-1.5 text-xs font-semibold text-slate-200">
                  Sign in
                </Link>
              )}
            </div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">{navigation.map((item)=><Link key={item.href} href={item.href} className="whitespace-nowrap rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-xs text-slate-300">{item.label}</Link>)}</nav>
        </header>
        <main className="relative px-4 py-7 sm:px-7 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
