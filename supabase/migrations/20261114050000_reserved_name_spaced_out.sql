-- DB-016 follow-up: the per-word check from 20261114040000 let a spaced-out
-- "GRAB STY" through. Keep the per-word lookalike check and bring back the
-- original whole-name check (spaces and punctuation dropped, exact "grabsty").
create or replace function public.reads_as_grabsty(p_name text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  with t as (
    select translate(lower(p_name),
             'аеорсухкмтвіјѕԁɡαεορτυνκμ4@0135$7',
             'aeopcyxkmtbijsdgaeoptuvkmaaoiesst') as s
  )
  select coalesce(
    regexp_replace((select s from t), '[^a-z]', '', 'g') ~ 'grabst[yv]'
    or exists (
      select 1
        from regexp_split_to_table((select s from t), '\s+') as w
       where regexp_replace(w, '[^a-z]', '', 'g') ~ 'grabs[tl]?[yv]'
    ),
    false);
$function$;
