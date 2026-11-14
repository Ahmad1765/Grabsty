-- Regression check for audit batch 7: ADM-003 (admin chat access only for
-- disputes), ADM-005 (KYC review fields, masked CNIC), ADM-006 (admin audit
-- log), DB-011 (own read marker only), DB-013 (push token shape, device cap),
-- DB-016 (lookalike names, official accounts can't be blocked).
-- Needs one admin profile. Everything rolls back; a failed expectation raises.
begin;

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm uuid := (select id from public.profiles where is_admin limit 1);
  l uuid; conv uuid; o public.orders; msg text; n int;
begin
  assert adm is not null, 'needs an admin profile';
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@t.test', now(), now()
  from unnest(array[s, b]) u;
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'R', 1500, '{}', 'clothing', 'men', 'good') returning id into l;
  insert into public.conversations (buyer_id, seller_id, listing_id) values (b, s, l) returning id into conv;
  insert into public.messages (conversation_id, sender_id, content, kind) values (conv, b, 'private note', 'text');
  insert into public.verifications (user_id, status, legal_name, document_kind, notes, cnic_number, id_back_photo_path)
  values (s, 'submitted', 'Sana Tariq Khan', 'national_id', s || '/front.jpg', '3520212345671', s || '/back.jpg');

  -- ADM-003: a private chat is off limits until the pair has a disputed order.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  msg := null;
  begin perform count(*) from public.admin_get_support_messages(conv); exception when others then msg := sqlerrm; end;
  assert msg = 'Not a support conversation', 'admin read a private chat: ' || coalesce(msg, 'no error');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o := public.process_checkout(l, null, 'cod', '{"line1":"1 St","city":"Lahore","phone":"03001234567"}');
  perform set_config('request.jwt.claims', '', true);
  update public.orders set status = 'disputed', fulfillment_status = 'disputed', disputed_at = now() where id = o.id;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*) into n from public.admin_get_support_messages(conv);
  assert n >= 1, 'admin cannot read the chat of a disputed order';

  -- ADM-006: that read is in the audit log, with who and which chat.
  assert exists (select 1 from public.admin_audit_log
                  where actor_id = adm and action = 'admin_get_support_messages' and target = conv::text),
    'admin chat read not logged';

  -- ADM-005: the reviewer's note doesn't overwrite the photo path; a rejected
  -- submission can't be approved without a new one; the list masks the CNIC.
  perform public.admin_review_kyc(s, 'rejected', 'Photo is blurry');
  assert (select notes = s || '/front.jpg' and review_notes = 'Photo is blurry' and reviewed_by = adm
            from public.verifications where user_id = s), 'review overwrote notes or lost the reviewer';
  msg := null;
  begin perform public.admin_review_kyc(s, 'approved'); exception when others then msg := sqlerrm; end;
  assert msg like 'This verification was already reviewed%', 'approved a rejected submission: ' || coalesce(msg, 'no error');
  assert (select cnic_number from public.admin_get_verifications('all') where user_id = s) = '•••••-••••567-1', 'CNIC not masked to last 4';
  assert exists (select 1 from public.admin_audit_log where action = 'admin_review_kyc' and target = s::text), 'KYC decision not logged';

  -- ...an approved verification can still be revoked, and the seller can't write reviewer fields.
  perform set_config('request.jwt.claims', '', true);
  update public.verifications set status = 'submitted' where user_id = s; -- the seller resubmitted
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.admin_review_kyc(s, 'approved');
  perform public.admin_review_kyc(s, 'rejected', 'Stolen CNIC');
  assert (select status = 'rejected' and review_notes = 'Stolen CNIC' from public.verifications where user_id = s)
     and not (select is_verified from public.profiles where id = s), 'approval could not be revoked';
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.verifications set review_notes = 'Approved by Ali', reviewed_by = s where user_id = s;
  execute 'reset role';
  assert (select review_notes = 'Stolen CNIC' and reviewed_by = adm from public.verifications where user_id = s),
    'seller rewrote the reviewer fields';

  -- DB-011: a participant can't move the other side's read marker.
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  msg := null;
  begin update public.conversations set buyer_last_read_at = now() + interval '50 years' where id = conv;
  exception when others then msg := sqlerrm; end;
  assert msg like 'permission denied%', 'seller moved the buyer''s read marker: ' || coalesce(msg, 'no error');

  -- DB-013: only real push tokens, and at most 10 devices per account.
  msg := null;
  begin perform public.register_device('not-a-token'); exception when others then msg := sqlerrm; end;
  assert msg = 'Not a push token', 'junk token accepted: ' || coalesce(msg, 'no error');
  for i in 1..12 loop
    perform public.register_device('ExponentPushToken[regression' || s || '-' || i || ']', 'ios', 'Phone');
  end loop;
  execute 'reset role';
  assert (select count(*) from public.user_devices where user_id = s) = 10, 'device cap not applied';

  -- DB-016: lookalike names are reserved; official accounts can't be blocked.
  execute 'set local role authenticated';
  msg := null;
  begin update public.profiles set full_name = 'Grаbsty Support Team' where id = s; exception when others then msg := sqlerrm; end;
  assert msg = 'That name is reserved. Please choose another.', 'Cyrillic lookalike accepted: ' || coalesce(msg, 'no error');
  msg := null;
  begin update public.profiles set username = 'grabsly.support' where id = s; exception when others then msg := sqlerrm; end;
  assert msg = 'That name is reserved. Please choose another.', 'near-spelling accepted: ' || coalesce(msg, 'no error');
  -- an ordinary name that only contains "grabs" as a word is fine
  update public.profiles set full_name = 'Ahmed Grabs Yousaf' where id = s;
  assert (select full_name from public.profiles where id = s) = 'Ahmed Grabs Yousaf', 'ordinary name refused';
  msg := null;
  begin insert into public.user_blocks (blocker_id, blocked_id) values (s, adm); exception when others then msg := sqlerrm; end;
  assert msg = 'Grabsty official accounts can''t be blocked', 'blocked an official account: ' || coalesce(msg, 'no error');
  execute 'reset role';
end $$;

rollback;
