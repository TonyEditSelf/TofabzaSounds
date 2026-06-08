-- Fast hybrid RAG search for Tofabza Sounds.
-- Run this in Supabase SQL editor after confirming pgvector is enabled.

create extension if not exists vector;

alter table public.kb_chunks
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', coalesce(content, ''))) stored;

create index if not exists kb_chunks_search_vector_idx
  on public.kb_chunks using gin (search_vector);

create index if not exists kb_chunks_embedding_hnsw_idx
  on public.kb_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists knowledge_bases_owner_idx
  on public.knowledge_bases (owner_type, owner_id, id);

create or replace function public.match_chunks_hybrid(
  query_embedding vector,
  query_text text,
  match_owner_id uuid,
  match_owner_type text default 'agent',
  match_count int default 3,
  match_threshold double precision default 0.35,
  vector_weight double precision default 0.72,
  text_weight double precision default 0.28
)
returns table (
  content text,
  source_file text,
  chunk_index int,
  similarity double precision,
  text_rank double precision,
  score double precision
)
language sql
stable
as $$
  with selected_kbs as (
    select id
    from public.knowledge_bases
    where owner_id = match_owner_id
      and owner_type = match_owner_type
  ),
  q as (
    select websearch_to_tsquery('simple', coalesce(nullif(query_text, ''), ' ')) as tsq
  ),
  vector_matches as (
    select
      c.content,
      c.source_file,
      c.chunk_index,
      greatest(0, 1 - (c.embedding <=> query_embedding))::double precision as similarity,
      0::double precision as text_rank
    from public.kb_chunks c
    join selected_kbs kb on kb.id = c.kb_id
    where greatest(0, 1 - (c.embedding <=> query_embedding)) >= match_threshold
    order by c.embedding <=> query_embedding
    limit greatest(match_count * 8, 24)
  ),
  text_matches as (
    select
      c.content,
      c.source_file,
      c.chunk_index,
      greatest(0, 1 - (c.embedding <=> query_embedding))::double precision as similarity,
      ts_rank_cd(c.search_vector, q.tsq)::double precision as text_rank
    from public.kb_chunks c
    join selected_kbs kb on kb.id = c.kb_id
    cross join q
    where c.search_vector @@ q.tsq
    order by ts_rank_cd(c.search_vector, q.tsq) desc
    limit greatest(match_count * 8, 24)
  ),
  merged as (
    select
      content,
      source_file,
      chunk_index,
      max(similarity) as similarity,
      max(text_rank) as text_rank
    from (
      select * from vector_matches
      union all
      select * from text_matches
    ) candidates
    group by content, source_file, chunk_index
  )
  select
    merged.content,
    merged.source_file,
    merged.chunk_index,
    merged.similarity,
    merged.text_rank,
    (
      vector_weight * merged.similarity +
      text_weight * least(1.0, merged.text_rank)
    )::double precision as score
  from merged
  order by score desc
  limit match_count;
$$;
