-- Staffer Phase 8 knowledge ingestion, retrieval, citations, retention and access control.

create table if not exists staffer.knowledge_collections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  sensitivity text not null default 'internal',
  access_mode text not null default 'organisation',
  retention_days integer,
  review_interval_days integer,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, key),
  constraint knowledge_collections_key_not_blank check (length(trim(key)) > 0),
  constraint knowledge_collections_name_not_blank check (length(trim(name)) > 0),
  constraint knowledge_collections_access_mode_check check (access_mode in ('organisation','restricted')),
  constraint knowledge_collections_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists staffer.knowledge_collection_agents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  collection_id uuid not null references staffer.knowledge_collections(id) on delete cascade,
  agent_id uuid not null references staffer.agents(id) on delete cascade,
  can_retrieve boolean not null default true,
  can_ingest boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (collection_id, agent_id),
  constraint knowledge_collection_agents_same_org unique (organisation_id, collection_id, agent_id)
);

alter table staffer.documents
  add column if not exists collection_id uuid references staffer.knowledge_collections(id) on delete set null,
  add column if not exists source_type text not null default 'manual_text',
  add column if not exists source_url text,
  add column if not exists status text not null default 'draft',
  add column if not exists version integer not null default 1,
  add column if not exists content_hash text,
  add column if not exists extracted_text text,
  add column if not exists extraction_status text not null default 'pending',
  add column if not exists scan_status text not null default 'pending',
  add column if not exists embedding_status text not null default 'not_requested',
  add column if not exists review_due_at timestamptz,
  add column if not exists retention_until timestamptz,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists superseded_by_document_id uuid references staffer.documents(id) on delete set null,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

alter table staffer.documents
  drop constraint if exists documents_status_check,
  add constraint documents_status_check check (status in ('draft','processing','approved','needs_review','retired','superseded')),
  drop constraint if exists documents_scan_status_check,
  add constraint documents_scan_status_check check (scan_status in ('pending','clean','flagged','failed','not_required')),
  drop constraint if exists documents_extraction_status_check,
  add constraint documents_extraction_status_check check (extraction_status in ('pending','completed','failed','not_required')),
  drop constraint if exists documents_embedding_status_check,
  add constraint documents_embedding_status_check check (embedding_status in ('not_requested','queued','completed','failed')),
  drop constraint if exists documents_metadata_object,
  add constraint documents_metadata_object check (jsonb_typeof(metadata) = 'object'),
  drop constraint if exists documents_version_positive,
  add constraint documents_version_positive check (version > 0);

create table if not exists staffer.document_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  document_id uuid not null references staffer.documents(id) on delete cascade,
  collection_id uuid references staffer.knowledge_collections(id) on delete set null,
  version integer not null,
  title text not null,
  source_url text,
  content_hash text not null,
  extracted_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version),
  constraint document_versions_version_positive check (version > 0),
  constraint document_versions_title_not_blank check (length(trim(title)) > 0),
  constraint document_versions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists staffer.document_chunks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  collection_id uuid references staffer.knowledge_collections(id) on delete set null,
  document_id uuid not null references staffer.documents(id) on delete cascade,
  document_version_id uuid not null references staffer.document_versions(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  citation jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  embedding_status text not null default 'not_requested',
  embedding_model_key text,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  unique (document_version_id, chunk_index),
  constraint document_chunks_index_positive check (chunk_index > 0),
  constraint document_chunks_content_not_blank check (length(trim(content)) > 0),
  constraint document_chunks_citation_object check (jsonb_typeof(citation) = 'object'),
  constraint document_chunks_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint document_chunks_embedding_status_check check (embedding_status in ('not_requested','queued','completed','failed'))
);

create table if not exists staffer.knowledge_retrieval_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references staffer.organisations(id) on delete cascade,
  agent_id uuid references staffer.agents(id) on delete set null,
  task_id uuid references staffer.tasks(id) on delete set null,
  query text not null,
  collection_keys text[] not null default '{}'::text[],
  result_chunk_ids uuid[] not null default '{}'::uuid[],
  citations jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint knowledge_retrieval_events_query_not_blank check (length(trim(query)) > 0),
  constraint knowledge_retrieval_events_citations_array check (jsonb_typeof(citations) = 'array')
);

create index if not exists knowledge_collections_org_active_idx
  on staffer.knowledge_collections (organisation_id, is_active, key);

create index if not exists knowledge_collection_agents_agent_idx
  on staffer.knowledge_collection_agents (agent_id, can_retrieve);

create index if not exists documents_org_collection_status_idx
  on staffer.documents (organisation_id, collection_id, status, updated_at desc);

create index if not exists document_versions_document_version_idx
  on staffer.document_versions (document_id, version desc);

create index if not exists document_chunks_collection_idx
  on staffer.document_chunks (organisation_id, collection_id, document_id);

create index if not exists document_chunks_search_idx
  on staffer.document_chunks using gin (search_vector);

create index if not exists knowledge_retrieval_events_org_created_idx
  on staffer.knowledge_retrieval_events (organisation_id, created_at desc);

alter table staffer.knowledge_collections enable row level security;
alter table staffer.knowledge_collection_agents enable row level security;
alter table staffer.document_versions enable row level security;
alter table staffer.document_chunks enable row level security;
alter table staffer.knowledge_retrieval_events enable row level security;

grant select, insert, update on staffer.knowledge_collections to authenticated;
grant select, insert, update, delete on staffer.knowledge_collection_agents to authenticated;
grant select, insert on staffer.document_versions to authenticated;
grant select, insert on staffer.document_chunks to authenticated;
grant select, insert on staffer.knowledge_retrieval_events to authenticated;

drop policy if exists knowledge_collections_member_select on staffer.knowledge_collections;
drop policy if exists knowledge_collections_operator_insert on staffer.knowledge_collections;
drop policy if exists knowledge_collections_operator_update on staffer.knowledge_collections;
drop policy if exists knowledge_collection_agents_member_select on staffer.knowledge_collection_agents;
drop policy if exists knowledge_collection_agents_admin_write on staffer.knowledge_collection_agents;
drop policy if exists document_versions_member_select on staffer.document_versions;
drop policy if exists document_versions_operator_insert on staffer.document_versions;
drop policy if exists document_chunks_member_select on staffer.document_chunks;
drop policy if exists document_chunks_operator_insert on staffer.document_chunks;
drop policy if exists knowledge_retrieval_events_member_select on staffer.knowledge_retrieval_events;
drop policy if exists knowledge_retrieval_events_operator_insert on staffer.knowledge_retrieval_events;

create policy knowledge_collections_member_select on staffer.knowledge_collections
for select to authenticated
using (staffer.is_member(organisation_id));

create policy knowledge_collections_operator_insert on staffer.knowledge_collections
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy knowledge_collections_operator_update on staffer.knowledge_collections
for update to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]))
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create policy knowledge_collection_agents_member_select on staffer.knowledge_collection_agents
for select to authenticated
using (staffer.is_member(organisation_id));

create policy knowledge_collection_agents_admin_write on staffer.knowledge_collection_agents
for all to authenticated
using (staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[]))
with check (
  staffer.has_role(organisation_id, array['founder','administrator']::staffer.membership_role[])
  and exists (
    select 1 from staffer.knowledge_collections c
    where c.id = collection_id
      and c.organisation_id = knowledge_collection_agents.organisation_id
  )
  and exists (
    select 1 from staffer.agents a
    where a.id = agent_id
      and a.organisation_id = knowledge_collection_agents.organisation_id
  )
);

create policy document_versions_member_select on staffer.document_versions
for select to authenticated
using (staffer.is_member(organisation_id));

create policy document_versions_operator_insert on staffer.document_versions
for insert to authenticated
with check (
  staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1 from staffer.documents d
    where d.id = document_id
      and d.organisation_id = document_versions.organisation_id
  )
);

create policy document_chunks_member_select on staffer.document_chunks
for select to authenticated
using (staffer.is_member(organisation_id));

create policy document_chunks_operator_insert on staffer.document_chunks
for insert to authenticated
with check (
  staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[])
  and exists (
    select 1 from staffer.documents d
    where d.id = document_id
      and d.organisation_id = document_chunks.organisation_id
  )
);

create policy knowledge_retrieval_events_member_select on staffer.knowledge_retrieval_events
for select to authenticated
using (staffer.is_member(organisation_id));

create policy knowledge_retrieval_events_operator_insert on staffer.knowledge_retrieval_events
for insert to authenticated
with check (staffer.has_role(organisation_id, array['founder','administrator','operator']::staffer.membership_role[]));

create or replace function staffer.agent_can_retrieve_collection(
  target_agent_id uuid,
  target_collection_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = staffer, public
as $$
  select exists (
    select 1
    from staffer.agents a
    join staffer.knowledge_collections c
      on c.organisation_id = a.organisation_id
    where a.id = target_agent_id
      and c.id = target_collection_id
      and c.is_active
      and (
        c.access_mode = 'organisation'
        or exists (
          select 1
          from staffer.knowledge_collection_agents kca
          where kca.collection_id = c.id
            and kca.agent_id = a.id
            and kca.can_retrieve
        )
      )
  );
$$;

create or replace function staffer.search_knowledge_chunks(
  target_query text,
  target_agent_id uuid default null,
  target_collection_keys text[] default null,
  target_limit integer default 5
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
  rank real
)
language plpgsql
security definer
set search_path = staffer, public
as $$
declare
  member_org_id uuid;
  agent_org_id uuid;
  query_text text;
  query_ts tsquery;
  result_chunk_ids uuid[];
  result_citations jsonb;
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
      ts_rank(dc.search_vector, query_ts) as rank
    from staffer.document_chunks dc
    join staffer.documents d on d.id = dc.document_id
    join staffer.knowledge_collections kc on kc.id = dc.collection_id
    where dc.organisation_id = member_org_id
      and d.status = 'approved'
      and kc.is_active
      and (target_collection_keys is null or array_length(target_collection_keys, 1) is null or kc.key = any(target_collection_keys))
      and (target_agent_id is null or staffer.agent_can_retrieve_collection(target_agent_id, kc.id))
      and dc.search_vector @@ query_ts
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
      result_chunk_ids,
      citations,
      created_by
    )
    select
      member_org_id,
      target_agent_id,
      query_text,
      coalesce(target_collection_keys, '{}'::text[]),
      coalesce(logged.chunk_ids, '{}'::uuid[]),
      coalesce(logged.citations, '[]'::jsonb),
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
    ranked.rank
  from ranked;
end;
$$;

revoke all on function staffer.agent_can_retrieve_collection(uuid, uuid) from public;
revoke all on function staffer.search_knowledge_chunks(text, uuid, text[], integer) from public;

grant execute on function staffer.agent_can_retrieve_collection(uuid, uuid) to authenticated, service_role;
grant execute on function staffer.search_knowledge_chunks(text, uuid, text[], integer) to authenticated, service_role;

comment on table staffer.knowledge_collections is 'Tenant-owned knowledge collections with sensitivity, retention and access-control metadata.';
comment on table staffer.knowledge_collection_agents is 'Explicit agent-to-collection retrieval and ingestion permissions.';
comment on table staffer.document_versions is 'Append-only document version snapshots for ingested knowledge.';
comment on table staffer.document_chunks is 'Citation-aware searchable chunks produced from document versions.';
comment on table staffer.knowledge_retrieval_events is 'Append-only record of knowledge retrieval queries, chunk ids and citations.';
comment on function staffer.search_knowledge_chunks(text, uuid, text[], integer) is 'Searches approved knowledge chunks with tenant and optional agent collection-access enforcement.';
