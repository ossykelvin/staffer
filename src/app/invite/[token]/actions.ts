"use server";

import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");

  if (isDemoMode()) {
    redirect("/settings?message=Demo invitation accepted. No live membership was created.");
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    redirect(`/login?next=/invite/${encodeURIComponent(token)}&error=${encodeURIComponent("Supabase is not configured.")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/invite/${encodeURIComponent(token)}&message=${encodeURIComponent("Sign in or create an account before accepting the invitation.")}`);
  }

  const { error } = await supabase.schema("staffer").rpc("accept_invitation_for_current_user", {
    invitation_token: token,
  });

  if (error) {
    redirect(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/?message=Invitation accepted.");
}
