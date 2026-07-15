import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { publicEnv } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: `${publicEnv.NEXT_PUBLIC_APP_NAME} | ${publicEnv.NEXT_PUBLIC_COMPANY_NAME}`,
  description: "A governed AI staff operations platform for task orchestration, approvals, knowledge and automation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
