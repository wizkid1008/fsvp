-- Diagnostic for the requirements-model merge. READ ONLY — changes nothing.
--
-- Run the whole file in the Supabase SQL editor. It is a single statement that
-- returns ONE row with one JSON column, so the editor cannot hide part of it
-- behind a later result set. Click the cell, copy, paste it back.
--
-- What each key answers:
--   evidence_shadow  Does requirement_evidence hold anything the app never
--                    wrote? reviewer_notes / gap_status / final_determination
--                    appear in no code path, so they should be 0. If they are
--                    not, that table holds review findings that exist nowhere
--                    else and cannot be dropped.
--   doc_pointers     How many documents record their requirement ONLY in the
--                    model being removed. "needs_mapping" is the real problem.
--   combinations     Which (legacy key, entity type) pairs actually occur.
--                    Each one is a cell of the mapping table to decide.
--                    An empty list means no mapping is needed at all.
--   fk_dependents    Everything still pointing at fsvp_requirements. Expect
--                    exactly documents and requirement_evidence.

select jsonb_pretty(jsonb_build_object(

  'evidence_shadow', (
    select jsonb_build_object(
      'total_rows',              count(*),
      'live_rows',               count(*) filter (where soft_deleted_at is null),
      'has_reviewer_notes',      count(reviewer_notes),
      'has_gap_status',          count(gap_status),
      'has_final_determination', count(final_determination),
      'has_reviewer',            count(reviewer_profile_id)
    )
    from requirement_evidence
  ),

  'doc_pointers', (
    select jsonb_build_object(
      'needs_mapping',   count(*) filter (where related_requirement_id is not null
                                            and requirement_item_id is null),
      'both_set',        count(*) filter (where related_requirement_id is not null
                                            and requirement_item_id is not null),
      'already_current', count(*) filter (where related_requirement_id is null
                                            and requirement_item_id is not null),
      'neither',         count(*) filter (where related_requirement_id is null
                                            and requirement_item_id is null),
      'total_documents', count(*)
    )
    from documents
    where soft_deleted_at is null
  ),

  'combinations', coalesce((
    select jsonb_agg(x order by x->>'documents' desc)
    from (
      select jsonb_build_object(
        'requirement_key',    r.requirement_key,
        'linked_entity_type', coalesce(d.linked_entity_type, '(none)'),
        'documents',          count(*)
      ) as x
      from documents d
      join fsvp_requirements r on r.id = d.related_requirement_id
      where d.soft_deleted_at is null
        and d.requirement_item_id is null
      group by r.requirement_key, d.linked_entity_type
    ) s
  ), '[]'::jsonb),

  'fk_dependents', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table',  tc.table_name,
      'column', kcu.column_name
    ))
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_name = 'fsvp_requirements'
  ), '[]'::jsonb)

)) as diagnosis;
