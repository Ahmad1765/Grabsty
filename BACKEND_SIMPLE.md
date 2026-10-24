# Grabsty — What We're Building (Plain English)

> A simple guide for anyone who wants to understand the backend plan without needing a tech background.

---

## The Big Picture

Think of Grabsty like a combination of **Depop + WhatsApp + a small online mall**.

People can list things they want to sell, others can browse, message the seller, make offers, and buy. We need a reliable "engine" running behind the scenes that makes all of this work.

That engine is called the **backend**.

---

## What Is a Backend?

When you tap "Buy Now" in the app, something has to:

- Check if the item is still available
- Calculate the price + platform fee
- Record that someone bought it
- Notify the seller
- Update the listing as sold

None of that happens by magic. It runs on computers (servers) we control. That's the backend.

The frontend (the screens you see) is already built. Our job now is to build everything that powers it.

---

## Our Tools (The Tech Stack — Simplified)

We're using a service called **Supabase**. Think of it as a Swiss Army knife for building app backends. It gives us:

| Tool               | What It Does                             | Real-World Analogy                 |
| ------------------ | ---------------------------------------- | ---------------------------------- |
| **Database**       | Stores all data permanently              | A giant, organized filing cabinet  |
| **Auth**           | Handles login/signup via OTP             | A security guard at the door       |
| **Storage**        | Holds all photos                         | Google Photos, but for our app     |
| **Realtime**       | Sends live updates (chat, notifications) | Like a walkie-talkie between users |
| **Edge Functions** | Custom logic for complex actions         | A calculator that runs our rules   |

We don't need to build any of this from scratch. Supabase handles the hard infrastructure. We just configure it and write our business rules on top.

---

## The Database — What Data We're Storing

Everything in the app is stored in **tables** — like spreadsheets, where each row is one item.

Here are the main tables in simple terms:

| Table             | What It Stores                                          |
| ----------------- | ------------------------------------------------------- |
| **profiles**      | Each user's name, photo, bio, location, rating          |
| **listings**      | Every item for sale (title, price, photos, condition)   |
| **follows**       | Who follows who                                         |
| **conversations** | Chat threads between a buyer and seller about a listing |
| **messages**      | Individual chat messages                                |
| **offers**        | Offers made on listings (price, status, expiry)         |
| **orders**        | Completed purchases                                     |
| **reviews**       | Star ratings and comments left after a sale             |
| **notifications** | Alerts (new offer, order shipped, etc.)                 |
| **reports**       | User reports of fake/spam listings                      |
| **app_config**    | Settings we can change (like the platform fee %)        |

These tables are connected. For example, an **order** links to a **listing**, a **buyer**, and a **seller**. A **review** only exists after an **order** is completed.

---

## The 8 Key "Workers" We're Building

Some actions in the app are too complex to handle with simple database reads/writes. For those, we write custom code called **Edge Functions** — think of them as specialist workers who handle specific jobs.

### 1. The Feed Ranker

**Job:** Decides which listings show up first in your home feed.

It's not random — it uses a scoring system:

- Items from sellers you follow → appear higher (+50 points)
- Newer items → appear higher (older items slowly fade, like a newspaper)
- Popular items (lots of views, likes, offers) → appear higher (+20 points)
- Items that had their price dropped → bump up (+10 points)
- Boosted listings → extra visibility (+25 points)

This score is recalculated every 30 minutes automatically.

### 2. The Offer Processor

**Job:** Handles the back-and-forth when someone makes an offer.

An offer can go through these stages:

```
Buyer makes offer → Pending
    ├─► Seller accepts → Order is automatically created
    ├─► Seller rejects → Offer closed
    ├─► Seller counters → New offer sent to buyer
    └─► Nobody responds → Offer expires after 48 hours
```

### 3. The Buy Now Handler

**Job:** When someone taps "Buy Now", this worker:

1. Checks the item hasn't already been sold to someone else (at the exact same second)
2. Calculates the total: item price + platform fee
3. Creates the order
4. Marks the listing as sold
5. Notifies the seller

It does all of this as one single locked action so two people can't buy the same item simultaneously.

### 4. The Image Upload Handler

**Job:** When a seller uploads photos, this gives them a secure link to upload directly without going through our servers — faster and more efficient.

### 5. The Notification Sender

**Job:** When something happens (new offer, message, order update), this worker sends a notification to the right person in real-time.

### 6. The Score Refresher _(runs automatically every 30 minutes)_

**Job:** Updates the ranking score for every live listing so the feed stays fresh and relevant.

### 7. The Offer Expiry Checker _(runs automatically every 5 minutes)_

**Job:** Scans for offers that have hit their 48-hour limit and marks them as expired.

### 8. The Admin Tool

**Job:** Lets admins take serious actions — ban a user, approve a listing, change the platform fee, remove fake followers, resolve reports.

---

## How a Sale Works — Step by Step

Here's a full buyer journey in plain terms:

```
1. Sara lists a dress → photos uploaded, listing saved, goes through a quick check → LIVE

2. Ahmed browses the feed → ranking system shows him relevant listings

3. Ahmed taps the listing → view is counted, listing detail loads

4. Ahmed taps "Message Seller" → a chat thread is created (if it doesn't exist)

5. Ahmed makes an offer of $2,000 (listing is $2,500)
   → Sara gets a notification: "New offer on your Zara dress"

6. Sara counters with $2,300
   → Ahmed gets a notification: "Sara countered your offer"

7. Ahmed accepts
   → An order is automatically created
   → Platform fee (e.g. 5%) is added: $2,300 + $115 = $2,415 total
   → Both are notified

8. Sara ships the item, enters TCS tracking number
   → Ahmed gets a notification: "Your order has shipped"

9. Ahmed receives the item, marks as delivered
   → Sara's "total sales" goes up by 1
   → Ahmed can now leave a review
   → Sara's rating updates
```

---

## The Admin Panel — What Admins Can Do

Admins get a special view of everything:

- **Dashboard**: See total users, total listings, total orders, total money processed (GMV)
- **User Management**: Ban scammers, suspend rule-breakers, give sellers a verified badge
- **Listing Moderation**: Remove fake or inappropriate listings
- **Reports Queue**: Review reports submitted by users and resolve them
- **Fee Control**: Change the platform's service fee percentage
- **Remove Fake Followers**: Clean up bot-inflated follow counts
- **Analytics Export**: Download data as a spreadsheet

---

## Security — How We Keep Things Safe

- **Login**: We use OTP codes sent to your phone/email (no passwords to steal)
- **Sessions**: You get a secure token that expires. It auto-refreshes silently.
- **Data Rules**: Every piece of data has rules — for example, you can only read _your own_ orders, not someone else's. This is enforced at the database level, not just in the app code.
- **Rate Limits**: You can't spam the system (e.g. max 3 OTP requests per hour, max 60 messages per minute)
- **Auto-Flagging**: If 3 different users report the same listing, it's automatically hidden and flagged for admin review

---

## Real-Time Features — What Updates Instantly

Some things in the app need to update the moment they happen:

| Feature              | Live or Not?                                  |
| -------------------- | --------------------------------------------- |
| Chat messages        | ✅ Live (appears instantly like WhatsApp)     |
| Notifications        | ✅ Live (badge updates immediately)           |
| Offer status changes | ✅ Live                                       |
| Home feed            | ❌ Refreshes when you pull down (that's fine) |
| Order status         | ✅ Live when you're viewing the order         |

---

## How We Build It — The Plan in Plain Terms

We build in order of dependency — you can't build the roof before the walls.

| Week | What Gets Built                           | Why This Order                      |
| ---- | ----------------------------------------- | ----------------------------------- |
| 1-2  | Login, profiles, photo upload             | Everything else needs user accounts |
| 2-3  | Listings (create, edit, delete, publish)  | Feed needs listings to show         |
| 3-4  | Home feed with real ranking               | Core feature of the app             |
| 4    | Follow / unfollow sellers                 | Feed needs to know who you follow   |
| 5-6  | Chat + offer system                       | Commerce needs conversations        |
| 6-7  | Buy Now + orders + shipping               | Offers need to turn into orders     |
| 7-8  | Reviews, reports, notifications           | These build on top of orders        |
| 8-9  | Admin panel                               | Needs all the data to exist first   |
| 9-10 | Hardening (speed, safety, stress testing) | Last before launch                  |

---

## The Risks — What Could Be Tricky

| Risk                                | In Plain Terms                                     | How We Handle It                                                             |
| ----------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Two people buying same item at once | Like two people grabbing the last item off a shelf | We "lock" the item during purchase so only one goes through                  |
| Offer confusion                     | Seller accepts, but offer already expired          | Strict rules: expired offers can't be accepted — system rejects it           |
| Too many users at once              | App slows down under load                          | We pre-calculate scores in the background, so the feed is just a fast lookup |
| Fake reviews or followers           | Bots inflating seller credibility                  | Admin tools to detect + remove; ratio-based flagging                         |
| Changing the platform fee           | Fee needs to update for new orders only            | Fee is stored in a settings table; old orders keep their original fee        |

---

## Summary

In short, we're building a reliable, secure, and scalable engine that powers every tap, swipe, and transaction in the Grabsty app. The frontend already looks great — now we're wiring up the brain behind it.

The approach keeps things simple: **one platform (Supabase), clear rules for every action, and build in logical order** so we don't have to redo work.

When this is done, a seller in Karachi can list a dress, a buyer in Lahore can find it, negotiate, buy it, and leave a review — all in a matter of minutes.

---

_Plain English version of BACKEND_BLUEPRINT.md — for questions, refer back to the technical document._
