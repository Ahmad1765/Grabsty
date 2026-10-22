-- QA pass 2026-10-22. messages.content had no length limit: a participant
-- could post a 100 KB+ text straight through the API and the other person's
-- chat renders it as one giant bubble (and it rides along in push payloads).
-- The composer now stops at 4000 characters; enforce the same here. Longest
-- existing row at the time: 877 characters.
alter table public.messages drop constraint if exists messages_text_length;
alter table public.messages add constraint messages_text_length check (char_length(content) <= 4000);
