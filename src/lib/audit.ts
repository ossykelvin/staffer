import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AuditEventInput = {
  organisationId?: string | null;
  actorType: string;
  actorId?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
};

export async function recordAuditEvent(input: AuditEventInput) {
  if (publicEnv.NEXT_PUBLIC_DEMO_MODE === "true") {
    return {
      mode: "demo" as const,
      eventType: input.eventType,
      summary: input.summary,
      createdAt: new Date().toISOString(),
    };
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase || !input.organisationId) {
    return {
      mode: "skipped" as const,
      eventType: input.eventType,
      summary: "Audit event not persisted because live Supabase context is unavailable.",
      createdAt: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase.schema("staffer").rpc("record_audit_event", {
    target_organisation_id: input.organisationId,
    target_actor_type: input.actorType,
    target_actor_id: input.actorId ?? null,
    target_event_type: input.eventType,
    target_entity_type: input.entityType ?? null,
    target_entity_id: input.entityId ?? null,
    target_summary: input.summary,
    target_details: input.details ?? {},
  });

  if (error) {
    return {
      mode: "error" as const,
      eventType: input.eventType,
      summary: error.message,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    mode: "live" as const,
    eventType: input.eventType,
    summary: input.summary,
    createdAt: String(data?.created_at ?? new Date().toISOString()),
    hash: typeof data?.event_hash === "string" ? data.event_hash : undefined,
  };
}
