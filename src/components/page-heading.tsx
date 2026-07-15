export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">{eyebrow}</p><h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">{description}</p></div>{action}</div>;
}
