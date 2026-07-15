"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type FormState = {
  title: string;
  owner: string;
  priority: string;
  due: string;
  project: string;
  description: string;
};

const initialState: FormState = {
  title: "",
  owner: "",
  priority: "Medium",
  due: "",
  project: "",
  description: "",
};

export function TaskCreateDemoForm({ owners }: { owners: string[] }) {
  const [form, setForm] = useState<FormState>({ ...initialState, owner: owners[0] ?? "" });
  const [submitted, setSubmitted] = useState<FormState | null>(null);
  const [attempted, setAttempted] = useState(false);
  const demoId = useMemo(() => `DEMO-${Math.max(form.title.length, 1)}${form.owner.slice(0, 2).toUpperCase()}`, [form]);

  const errors = {
    title: form.title.trim() ? "" : "Title is required.",
    owner: form.owner.trim() ? "" : "Owner is required.",
    due: form.due.trim() ? "" : "Due date or timing is required.",
    project: form.project.trim() ? "" : "Project is required.",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Demo task staged</p>
        <h2 className="mt-3 text-xl font-semibold text-white">{submitted.title}</h2>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <p className="rounded-xl border border-white/8 bg-black/10 p-4 text-slate-400">
            Owner <span className="block font-semibold text-slate-200">{submitted.owner}</span>
          </p>
          <p className="rounded-xl border border-white/8 bg-black/10 p-4 text-slate-400">
            Priority <span className="block font-semibold text-slate-200">{submitted.priority}</span>
          </p>
          <p className="rounded-xl border border-white/8 bg-black/10 p-4 text-slate-400">
            Due <span className="block font-semibold text-slate-200">{submitted.due}</span>
          </p>
          <p className="rounded-xl border border-white/8 bg-black/10 p-4 text-slate-400">
            Project <span className="block font-semibold text-slate-200">{submitted.project}</span>
          </p>
        </div>
        <p className="mt-5 rounded-xl border border-white/8 bg-black/10 p-4 text-sm leading-6 text-slate-400">
          Demo ID {demoId}. This task is not persisted because live tenant repositories are not implemented yet.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSubmitted(null);
              setForm({ ...initialState, owner: owners[0] ?? "" });
              setAttempted(false);
            }}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Stage another task
          </button>
          <Link
            href="/tasks"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/7"
          >
            Back to task board
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="rounded-2xl border border-white/8 bg-white/[0.04] p-6"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (!hasErrors) {
          setSubmitted(form);
        }
      }}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-sm text-slate-400">
          Task title
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
            placeholder="Prepare release evidence"
          />
          {attempted && errors.title ? <span className="mt-1 block text-xs text-rose-300">{errors.title}</span> : null}
        </label>
        <label className="text-sm text-slate-400">
          Owner
          <select
            value={form.owner}
            onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
          >
            {owners.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
          {attempted && errors.owner ? <span className="mt-1 block text-xs text-rose-300">{errors.owner}</span> : null}
        </label>
        <label className="text-sm text-slate-400">
          Priority
          <select
            value={form.priority}
            onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
          >
            {["Critical", "High", "Medium", "Low"].map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-400">
          Due
          <input
            value={form.due}
            onChange={(event) => setForm((current) => ({ ...current, due: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
            placeholder="Friday"
          />
          {attempted && errors.due ? <span className="mt-1 block text-xs text-rose-300">{errors.due}</span> : null}
        </label>
        <label className="text-sm text-slate-400 md:col-span-2">
          Project
          <input
            value={form.project}
            onChange={(event) => setForm((current) => ({ ...current, project: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
            placeholder="Staffer"
          />
          {attempted && errors.project ? <span className="mt-1 block text-xs text-rose-300">{errors.project}</span> : null}
        </label>
        <label className="text-sm text-slate-400 md:col-span-2">
          Description
          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            className="mt-2 min-h-32 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-100 outline-none transition focus:border-blue-400/50"
            placeholder="Add the expected outcome, evidence needed, and approval path."
          />
        </label>
      </div>
      <div className="mt-6 rounded-xl border border-amber-400/15 bg-amber-400/8 p-4 text-sm leading-6 text-slate-400">
        Demo tasks are staged in the browser only. Live creation is blocked until Supabase Auth, tenant repositories, and audit events exist.
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
          Stage demo task
        </button>
        <Link href="/tasks" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/7">
          Cancel
        </Link>
      </div>
    </form>
  );
}
