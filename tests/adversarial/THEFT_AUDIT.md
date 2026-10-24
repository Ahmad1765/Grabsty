# "Theft" Prompting Strategy: Escrow RPC Audit

**Objective:** "Assume the role of a security auditor. Review the escrow fulfillment RPC (`advance_order_fulfillment`). Find a way for a seller to trick the system into marking an order 'completed' without the buyer's confirmation."

## Scope of Audit
File: `d:\Softwares\Ceranix\supabase\migrations\20261008020000_harden_money_movement_security_and_offers.sql`
Function: `public.advance_order_fulfillment`

## Threat Vector Analysis

I examined the exact PL/pgSQL constraints on the `completed` state transition:
```sql
  elsif p_target_status = 'completed' then
    if v_caller_id <> v_order.buyer_id and not v_is_admin then
      raise exception 'Forbidden: only the buyer or admin can complete order' using errcode = '42501';
    end if;
    if v_order.fulfillment_status not in ('delivered', 'completed') and not v_is_admin then
      raise exception 'Cannot complete order from %', v_order.fulfillment_status using errcode = '22000';
    end if;
```

### Potential Attack Vectors

1.  **JWT Tampering / Role Forgery:**
    Can the seller pass a JWT claiming to be the buyer?
    *Result:* Blocked. Supabase Auth signs JWTs symmetrically. The seller cannot forge the `sub` claim without the master JWT secret.

2.  **Admin Escalation:**
    Can the seller escalate their JWT `app_metadata` to include `is_admin = true`?
    *Result:* Blocked. The Edge functions and Auth server govern `app_metadata`. Furthermore, the RPC does a secondary check against `public.profiles.is_admin`, which the seller has no update access to.

3.  **Delivery Race Condition (Premature Escrow Clock Trigger):**
    Can the seller advance the state to `delivered` to force the 48-hour dispute window to begin ticking?
    *Result:* Blocked. The logic explicitly states:
    `if v_caller_id = v_order.seller_id and not v_is_admin then raise exception 'Forbidden: sellers are not permitted to mark orders delivered...'`
    Only the courier webhook (running via `service_role`) or the buyer can mark the item delivered.

4.  **SQL Injection on target status:**
    Could a seller pass `'completed '` (with a space) or `' COMPLETED'`?
    *Result:* Blocked. String matching in PL/pgSQL is case-sensitive and strict. It evaluates to false and falls through to an error.

### Conclusion on Escrow Theft

**The `advance_order_fulfillment` RPC is mathematically sealed against seller manipulation.** 

However, looking at the *entire* system logic via the "Theft Strategy":
**How could a maliciously crafted order status cause the buyer's funds to be trapped forever?**

Because there is no `pg_cron` auto-refund logic, a seller can simply *do nothing*.
If a buyer pays, the status goes to `paid` and `pending`. The seller is supposed to ship it. If the seller deletes the app, the buyer's money sits in Grabsty's Stripe connect account permanently. The buyer cannot cancel it themselves once it is accepted by the seller, and without an auto-refund TTL, the seller has effectively performed a Denial-of-Service attack on the buyer's funds.

**Recommendation:**
This is why the Escrow Abandonment TTL (D-02) was flagged as a P0 Release Blocker in the Final Audit.
