-- Normalize legacy list IDs stored in wbs_items.kanban_stage_id.
-- The column also supports UUID storage IDs from V2 imports, so only update
-- rows whose stage can be resolved unambiguously within the same board.
with stage_matches as (
  select
    card.id as card_id,
    coalesce(stage.legacy_node_id, stage.id::text) as canonical_stage_id
  from public.wbs_items card
  join lateral (
    select s.id, s.legacy_node_id
    from public.wbs_items s
    where s.tenant_id = card.tenant_id
      and s.project_id = card.project_id
      and (
        s.id::text = card.kanban_stage_id
        or s.legacy_node_id = card.kanban_stage_id
        or s.legacy_node_id = 'list_' || card.kanban_stage_id
      )
    order by
      case
        when s.id::text = card.kanban_stage_id then 1
        when s.legacy_node_id = card.kanban_stage_id then 2
        else 3
      end
    limit 1
  ) stage on true
  where card.kanban_stage_id is not null
)
update public.wbs_items item
set kanban_stage_id = stage_matches.canonical_stage_id,
    updated_at = now()
from stage_matches
where item.id = stage_matches.card_id
  and item.kanban_stage_id is distinct from stage_matches.canonical_stage_id;
