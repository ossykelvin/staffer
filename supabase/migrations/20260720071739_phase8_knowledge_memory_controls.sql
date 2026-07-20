-- Staffer PB-033: Knowledge upload and memory controls.
-- Adds governed upload metadata, storage policies, local embedding vectors,
-- memory scopes, retrieval filters, promotion approvals and retention actions.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staffer-knowledge',
  'staffer-knowledge',
  false,
  10485760,
  array[
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/xml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table staffer.knowledge_collections
  add column if not exists memory_scope text not null default 'company',
  add column if not exists project_key text,
  add column if not exists customer_key text,
  add column if not exists promotion_policy jsonb not null default '{"requiresApproval":true}'::jsonb;

alter table staffer.knowledge_collections
  drop constraint if exists knowledge_collections_memory_scope_check,
  add constraint knowledge_collections_memory_scope_check check (memory_scope in ('task','customer','project','company')),
  drop constraint if exists knowledge_collections_promotion_policy_object,
  add constraint knowledge_collections_promotion_policy_object check (jsonb_typeof(promotion_policy) = 'object');

alter table staffer.documents
  add column if not exists original_filename text,
  add column if not exists file_size_bytes bigint,
  add column if not exists storage_bucket text not null default 'staffer-knowledge',
  add column if not exists upload_status text not null default 'not_required',
  add column if not exists scan_summary text,
  add column if not exists memory_scope text not null default 'company',
  add column if not exists project_key text,
  add column if not exists customer_key text,
  add column if not exists promoted_from_document_id uuid references staffer.documents(id) on delete set null,
  add column if not exists promotion_approval_id uuid references staffer.approvals(id) on delete set null,
  add column if not exists deletion_approval_id uuid references staffer.approvals(id) on delete set null,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table staffer.documents
  drop constraint if exists documents_status_check,
  add constraint documents_status_check check (status in ('draft','processing','approved','needs_review','retired','superseded','deletion_requested')),
  drop constraint if exists documents_upload_status_check,
  add constraint documents_upload_status_check check (upload_status in ('not_required','uploaded','blocked','failed')),
  drop constraint if exists documents_memory_scope_check,
  add constraint documents_memory_scope_check check (memory_scope in ('task','customer','project','company')),
  drop constraint if exists documents_file_size_nonnegative,
  add constraint documents_file_size_nonnegative check (file_size_bytes is null or file_size_bytes >= 0);

alter table staffer.document_versions
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists scan_status text not null default 'not_required',
  add column if not exists extraction_status text not null default 'completed',
  add column if not exists memory_scope text not null default 'company',
  add column if not exists project_key text,
  add column if not exists customer_key text;

alter table staffer.document_versions
  drop constraint if exists document_versions_scan_status_check,
  add constraint document_versions_scan_status_check check (scan_status in ('pending','clean','flagged','failed','not_required')),
  drop constraint if exists document_versions_extraction_status_check,
  add constraint document_versions_extraction_status_check check (extraction_status in ('pending','completed','failed','not_required')),
  drop constraint if exists document_versions_memory_scope_check,
  add constraint document_versions_memory_scope_check check (memory_scope in ('task','customer','project','company')),
  drop constraint if exists document_versions_file_size_nonnegative,
  add constraint document_versions_file_size_nonnegative check (file_size_bytes is null or file_size_bytes >= 0);

alter table staffer.document_chunks
  add column if not exists sensitivity text not null default 'internal',
  add column if not exists memory_scope text not null default 'company',
  add column if not exists project_key text,
  add column if not exists customer_key text,
  add column if not exists embedding extensions.vector(64),
  add column if not exists embedding_dimensions integer not null default 64,
  add column if not exists embedding_input_hash text,
  add column if not exists embedding_generated_at timestamptz,
  add column if not exists embedding_metadata jsonb not null default '{}'::jsonb;

alter table staffer.document_chunks
  drop constraint if exists document_chunks_memory_scope_check,
  add constraint document_chunks_memory_scope_check check (memory_scope in ('task','customer','project','company')),
  drop constraint if exists document_chunks_embedding_dimensions_check,
  add constraint document_chunks_embedding_dimensions_check check (embedding_dimensions = 64),
  drop constraint if exists document_chunks_embedding_metadata_object,
  add constraint document_chunks_embedding_metadata_object check (jsonb_typeof(embedding_metadata) = 'object');

alter table staffer.knowledge_retrieval_events
  add column if not exists memory_scopes text[] not null default '{}'::text[],
  add column if not exists project_key text,
  add column if not exists customer_key text,
  add column if not exists sensitivity_filter text[] not null default '{}'::text[],
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table staffer.knowledge_retrieval_events
  drop constraint if exists knowledge_retrieval_events_metadata_object,
  add constraint knowledge_retrieval_events_metadata_object check (jsonb_typeof(metadata) = 'object');

create table if not exists staffer.knowledge_memory_promotions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  source_document_id uuid not null references staffer.documents(id) on delete cascade,
  approval_id uuid references staffer.approvals(id) on delete set null,
  source_memory_scope text not null,
  target_memory_scope text not null,
  reason text not null,
  status text not null default 'approval_requested',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_memory_promotions_scope_check check (
    source_memory_scope in ('task','customer','project','company')
    and target_memory_scope in ('task','customer','project','company')
  ),
  constraint knowledge_memory_promotions_status_check check (status in ('approval_requested','approved','rejected','changes_requested','applied','cancelled')),
  constraint knowledge_memory_promotions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists staffer.knowledge_retention_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  document_id uuid not null references staffer.documents(id) on delete cascade,
  approval_id uuid references staffer.approvals(id) on delete set null,
  action_key text not null,
  reason text not null,
  status text not null default 'approval_requested',
  action_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  constraint knowledge_retention_actions_key_check check (action_key in ('knowledge.retention_delete','knowledge.retention_retire')),
  constraint knowledge_retention_actions_status_check check (status in ('approval_requested','approved','rejected','changes_requested','executed','cancelled')),
  constraint knowledge_retention_actions_payload_object check (jsonb_typeof(action_payload) = 'object')
);

update staffer.knowledge_collections
set memory_scope = coalesce(nullif(memory_scope, ''), 'company');

update staffer.documents
set memory_scope = coalesce(nullif(memory_scope, ''), 'company'),
    storage_bucket = coalesce(nullif(storage_bucket, ''), 'staffer-knowledge'),
    upload_status = coalesce(nullif(upload_status, ''), case when storage_path is null then 'not_required' else 'uploaded' end);

update staffer.document_versions dv
set memory_scope = d.memory_scope,
    project_key = d.project_key,
    customer_key = d.customer_key,
    storage_path = coalesce(dv.storage_path, d.storage_path),
    mime_type = coalesce(dv.mime_type, d.mime_type),
    file_size_bytes = coalesce(dv.file_size_bytes, d.file_size_bytes),
    scan_status = coalesce(nullif(dv.scan_status, ''), d.scan_status),
    extraction_status = coalesce(nullif(dv.extraction_status, ''), d.extraction_status)
from staffer.documents d
where d.id = dv.document_id;

update staffer.document_chunks dc
set sensitivity = d.sensitivity,
    memory_scope = d.memory_scope,
    project_key = d.project_key,
    customer_key = d.customer_key
from staffer.documents d
where d.id = dc.document_id;

create index if not exists knowledge_collections_org_scope_idx
  on staffer.knowledge_collections (organisation_id, memory_scope, project_key, customer_key)
  where is_active;

create index if not exists documents_org_scope_status_idx
  on staffer.documents (organisation_id, memory_scope, project_key, customer_key, status, updated_at desc)
  where deleted_at is null;

create index if not exists documents_retention_due_idx
  on staffer.documents (organisation_id, retention_until)
  where retention_until is not null and legal_hold = false and deleted_at is null;

create index if not exists document_versions_collection_version_idx
  on staffer.document_versions (organisation_id, collection_id, version desc);

create index if not exists document_chunks_filter_idx
  on staffer.document_chunks (organisation_id, memory_scope, project_key, customer_key, sensitivity);

create index if not exists document_chunks_embedding_hnsw_idx
  on staffer.document_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create index if not exists knowledge_memory_promotions_org_status_idx
  on staffer.knowledge_memory_promotions (organisation_id, status, created_at desc);

create index if not exists knowledge_memory_promotions_document_idx
  on staffer.knowledge_memory_promotions (source_document_id, created_at desc);

create index if not exists knowledge_retention_actions_org_status_idx
  on staffer.knowledge_retention_actions (organisation_id, status, created_at desc);

create index if not exists knowledge_retention_actions_document_idx
  on staffer.knowledge_retention_actions (document_id, created_at desc);

alter table staffer.knowledge_memory_promotions enable row level security;
alter table staffer.knowledge_retention_actions enable row level security;

grant select, insert, update on staffer.knowledge_memory_promotions to authenticated;
grant select, insert, update on staffer.knowledge_retention_actions to authenticated;
grant select, insert, update, delete on
  staffer.knowledge_memory_promotions,
  staffer.knowledge_retention_actions
to service_role;

drop policy if exists knowledge_memory_promotions_member_select on staffer.knowledge_memory_promotions;
drop policy if exists knowledge_memory_promotions_operator_insert on staffer.knowledge_memory_promotions;
drop policy if exists knowledge_memory_promotions_reviewer_update on staffer.knowledge_memory_promotions;
drop policy if exists knowledge_retention_actions_member_select on staffer.knowledge_retention_actions;
drop policy if exists knowledge_retention_actions_operator_insert on staffer.knowledge_retention_actions;
drop policy if exists knowledge_retention_actions_reviewer_update on staffer.knowledge_retention_actions;

create policy knowledge_memory_promotions_member_select on staffer.knowledge_memory_promotions
for select to authenticated
using (staffer.is_member(organisation_id));

create policy knowledge_memory_promotions_operator_insert on staffer.knowledge_memory_promotions
for insert to authenticated
with check (
  staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1 from staffer.documents d
    where d.id = source_document_id
      and d.organisation_id = knowledge_memory_promotions.organisation_id
  )
);

create policy knowledge_memory_promotions_reviewer_update on staffer.knowledge_memory_promotions
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','reviewer']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','reviewer']::staffer.membership_role[]));

create policy knowledge_retention_actions_member_select on staffer.knowledge_retention_actions
for select to authenticated
using (staffer.is_member(organisation_id));

create policy knowledge_retention_actions_operator_insert on staffer.knowledge_retention_actions
for insert to authenticated
with check (
  staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1 from staffer.documents d
    where d.id = document_id
      and d.organisation_id = knowledge_retention_actions.organisation_id
  )
);

create policy knowledge_retention_actions_reviewer_update on staffer.knowledge_retention_actions
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','reviewer']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','reviewer']::staffer.membership_role[]));

drop policy if exists staffer_knowledge_storage_select on storage.objects;
drop policy if exists staffer_knowledge_storage_insert on storage.objects;

create policy staffer_knowledge_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'staffer-knowledge'
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and staffer.is_member(((storage.foldername(name))[1])::uuid)
);

create policy staffer_knowledge_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'staffer-knowledge'
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and staffer.has_role(((storage.foldername(name))[1])::uuid, array['founder','administrator','operator']::staffer.membership_role[])
);

drop function if exists staffer.search_knowledge_chunks(text, uuid, text[], integer);

create or replace function staffer.search_knowledge_chunks(
  target_query text,
  target_agent_id uuid default null,
  target_collection_keys text[] default null,
  target_limit integer default 5,
  target_memory_scopes text[] default null,
  target_project_key text default null,
  target_customer_key text default null,
  target_sensitivity text[] default null,
  target_include_expired boolean default false,
  target_query_embedding extensions.vector(64) default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  collection_id uuid,
  collection_key text,
  collection_name text,
  document_title text,
  chunk_index integer,
  excerpt text,
  citation jsonb,
  rank real,
  semantic_similarity real,
  sensitivity text,
  memory_scope text,
  project_key text,
  customer_key text
)
language plpgsql
security definer
set search_path = staffer, public, extensions
as $$
declare
  member_org_id uuid;
  agent_org_id uuid;
  query_text text;
  query_ts tsquery;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to search knowledge.';
  end if;

  query_text := trim(coalesce(target_query, ''));
  if query_text = '' then
    raise exception 'Knowledge search query is required.';
  end if;

  select organisation_id
  into member_org_id
  from staffer.memberships
  where user_id = (select auth.uid())
  order by created_at asc
  limit 1;

  if member_org_id is null then
    raise exception 'Organisation membership is required to search knowledge.';
  end if;

  if target_agent_id is not null then
    select organisation_id
    into agent_org_id
    from staffer.agents
    where id = target_agent_id;

    if agent_org_id is null or agent_org_id <> member_org_id then
      raise exception 'Agent does not belong to your organisation.';
    end if;
  end if;

  query_ts := plainto_tsquery('english', query_text);

  return query
  with ranked as (
    select
      dc.id as chunk_id,
      dc.document_id,
      kc.id as collection_id,
      kc.key as collection_key,
      kc.name as collection_name,
      d.title as document_title,
      dc.chunk_index,
      dc.content,
      dc.citation,
      (
        ts_rank(dc.search_vector, query_ts)
        + case
            when target_query_embedding is not null and dc.embedding is not null
              then greatest(0, 1 - (dc.embedding <=> target_query_embedding)) * 0.35
            else 0
          end
      )::real as rank,
      case
        when target_query_embedding is not null and dc.embedding is not null
          then (1 - (dc.embedding <=> target_query_embedding))::real
        else null::real
      end as semantic_similarity,
      d.sensitivity,
      d.memory_scope,
      d.project_key,
      d.customer_key
    from staffer.document_chunks dc
    join staffer.documents d on d.id = dc.document_id
    join staffer.knowledge_collections kc on kc.id = dc.collection_id
    where dc.organisation_id = member_org_id
      and d.status = 'approved'
      and d.deleted_at is null
      and d.scan_status in ('clean','not_required')
      and d.extraction_status in ('completed','not_required')
      and (target_include_expired or d.legal_hold or d.retention_until is null or d.retention_until > now())
      and kc.is_active
      and (target_collection_keys is null or array_length(target_collection_keys, 1) is null or kc.key = any(target_collection_keys))
      and (target_memory_scopes is null or array_length(target_memory_scopes, 1) is null or d.memory_scope = any(target_memory_scopes))
      and (target_project_key is null or target_project_key = '' or d.project_key = target_project_key)
      and (target_customer_key is null or target_customer_key = '' or d.customer_key = target_customer_key)
      and (target_sensitivity is null or array_length(target_sensitivity, 1) is null or d.sensitivity = any(target_sensitivity))
      and (target_agent_id is null or staffer.agent_can_retrieve_collection(target_agent_id, kc.id))
      and (
        dc.search_vector @@ query_ts
        or (
          target_query_embedding is not null
          and dc.embedding is not null
          and 1 - (dc.embedding <=> target_query_embedding) > 0.15
        )
      )
    order by rank desc, d.updated_at desc, dc.chunk_index asc
    limit greatest(1, least(coalesce(target_limit, 5), 12))
  ),
  logged as (
    select
      array_agg(r.chunk_id order by r.rank desc) as chunk_ids,
      jsonb_agg(r.citation order by r.rank desc) as citations
    from ranked r
  ),
  inserted as (
    insert into staffer.knowledge_retrieval_events (
      organisation_id,
      agent_id,
      query,
      collection_keys,
      memory_scopes,
      project_key,
      customer_key,
      sensitivity_filter,
      result_chunk_ids,
      citations,
      metadata,
      created_by
    )
    select
      member_org_id,
      target_agent_id,
      query_text,
      coalesce(target_collection_keys, '{}'::text[]),
      coalesce(target_memory_scopes, '{}'::text[]),
      nullif(target_project_key, ''),
      nullif(target_customer_key, ''),
      coalesce(target_sensitivity, '{}'::text[]),
      coalesce(logged.chunk_ids, '{}'::uuid[]),
      coalesce(logged.citations, '[]'::jsonb),
      jsonb_build_object(
        'source', 'PB-033',
        'hasQueryEmbedding', target_query_embedding is not null,
        'includeExpired', target_include_expired
      ),
      (select auth.uid())
    from logged
    returning id
  )
  select
    ranked.chunk_id,
    ranked.document_id,
    ranked.collection_id,
    ranked.collection_key,
    ranked.collection_name,
    ranked.document_title,
    ranked.chunk_index,
    left(ranked.content, 600) as excerpt,
    ranked.citation,
    ranked.rank,
    ranked.semantic_similarity,
    ranked.sensitivity,
    ranked.memory_scope,
    ranked.project_key,
    ranked.customer_key
  from ranked;
end;
$$;

revoke all on function staffer.search_knowledge_chunks(text, uuid, text[], integer, text[], text, text, text[], boolean, extensions.vector(64)) from public;
grant execute on function staffer.search_knowledge_chunks(text, uuid, text[], integer, text[], text, text, text[], boolean, extensions.vector(64)) to authenticated, service_role;

comment on column staffer.documents.memory_scope is 'Memory boundary for retrieval: task, customer, project or company.';
comment on column staffer.documents.scan_summary is 'Safe summary of upload scanning outcome; never stores scanner secrets or raw file bytes.';
comment on column staffer.document_chunks.embedding is 'Local or provider-generated chunk embedding used for semantic retrieval.';
comment on table staffer.knowledge_memory_promotions is 'Approval-gated requests to promote task/customer/project memory into longer-lived knowledge scopes.';
comment on table staffer.knowledge_retention_actions is 'Approval-gated retention and deletion workflow requests for knowledge documents.';
comment on function staffer.search_knowledge_chunks(text, uuid, text[], integer, text[], text, text, text[], boolean, extensions.vector(64)) is 'Searches approved knowledge chunks with tenant, optional agent, memory-scope, project, customer, sensitivity and retention filters.';
