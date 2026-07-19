"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

function profileInitial(email?: string) {
  return (email?.trim().charAt(0) || "U").toUpperCase();
}

type ProfileMenuProps = {
  email?: string;
  signOutAction: () => Promise<void>;
};

export function ProfileMenu({ email, signOutAction }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const userEmail = email ?? "Signed-in user";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={isOpen ? "Close profile menu" : "Open profile menu"}
        aria-controls={menuId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="grid size-9 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-xs font-bold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
      >
        {profileInitial(email)}
      </button>
      {isOpen ? (
        <div id={menuId} aria-label="Profile menu" className="absolute right-0 mt-3 w-64 rounded-2xl border border-white/10 bg-[#0b172d] p-3 shadow-2xl shadow-black/40">
          <div className="rounded-xl bg-white/[0.04] px-3 py-2">
            <p className="text-xs font-semibold text-white">Signed in</p>
            <p className="mt-1 truncate text-xs text-slate-400">{userEmail}</p>
          </div>
          <Link
            href="/settings"
            className="mt-2 block rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/7 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
            onClick={() => setIsOpen(false)}
          >
            Settings
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-200 transition hover:bg-rose-400/10 hover:text-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
