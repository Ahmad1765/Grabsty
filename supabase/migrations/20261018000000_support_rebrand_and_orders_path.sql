-- Support bot: orders live under Activity > Orders, not Profile > My Orders.
insert into public.support_bot_replies (key, content) values
  ('order_tracking_delivery', E'📦 **Tracking Your Order**\n\n1. Open the **Activity** tab > **Orders**.\n2. Tap on your active order to view live courier status, tracking number, and estimated delivery date.\n3. Sellers have up to **5 business days** to dispatch. Once shipped, standard delivery takes 2–4 business days across Pakistan.\n\nNeed help with a delayed parcel? Feel free to reply with your order details.')
on conflict (key) do update set content = excluded.content;

-- Leftover pre-rebrand naming on the support account and its old messages.
update public.profiles
   set username = 'grabsty_support', full_name = 'Grabsty Support'
 where id = '00000000-0000-0000-0000-000000000001'
   and username = 'ceranix_support';

update public.messages
   set content = replace(content, 'Ceranix', 'Grabsty')
 where sender_id = '00000000-0000-0000-0000-000000000001'
   and content like '%Ceranix%';

update public.conversations
   set last_message = replace(last_message, 'Ceranix', 'Grabsty')
 where last_message like '%Ceranix%';
