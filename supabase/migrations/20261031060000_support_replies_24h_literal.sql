-- Spell out the two support bot replies the 48h -> 24h change rewrote with
-- replace(). Content is unchanged; this makes the exact text lib/supportReplies.ts
-- sends reproducible from migrations alone (the bot only sends replies that
-- exist in support_bot_replies).
insert into public.support_bot_replies (key, content) values
  ('buyer_protection_guarantee', E'🛡️ **Grabsty Buyer Protection**\n\nEvery transaction processed through Grabsty is 100% protected:\n\n• **Safe Escrow**: We hold your payment securely until you receive and inspect your parcel.\n• **24-Hour Inspection Window**: You have 24 hours from delivery to verify your item. If it’s damaged or not as described, tap "I have an issue" to pause payout.\n• **Full Refund Guarantee**: If an item never arrives or is counterfeit, you get a full refund including shipping fees.'),
  ('seller_payouts_wallet', E'💳 **Seller Payouts**\n\n• Once the buyer confirms delivery (or 24h after courier delivery), funds are released to your **Grabsty Balance**.\n• You can instantly withdraw to any Pakistani Bank Account, JazzCash, or Easypaisa.\n• Withdrawals are processed within 24 business hours with zero hidden deduction fees.')
on conflict (key) do update set content = excluded.content;
