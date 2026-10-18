// Canned Grabsty Support bot replies. The bot can only post these exact texts:
// dispatch_support_bot_reply rejects anything not in public.support_bot_replies,
// which is seeded from this file (supportReplies.test.ts fails if they drift).
// Changing a reply here needs a migration that upserts the new text.

export const SUPPORT_KNOWLEDGE_BASE: { keywords: string[]; title: string; answer: string }[] = [
  {
    keywords: ['track', 'order', 'delivery', 'package', 'shipping', 'dispatch', 'courier', 'where is'],
    title: 'Order Tracking & Delivery',
    answer:
      `📦 **Tracking Your Order**\n\n` +
      `1. Open the **Activity** tab > **Orders**.\n` +
      `2. Tap on your active order to view live courier status, tracking number, and estimated delivery date.\n` +
      `3. Sellers have up to **5 business days** to dispatch. Once shipped, standard delivery takes 2–4 business days across Pakistan.\n\n` +
      `Need help with a delayed parcel? Feel free to reply with your order details.`,
  },
  {
    keywords: ['protection', 'refund', 'money back', 'guarantee', 'damaged', 'not as described', 'return', 'cancel'],
    title: 'Buyer Protection Guarantee',
    answer:
      `🛡️ **Grabsty Buyer Protection**\n\n` +
      `Every transaction processed through Grabsty is 100% protected:\n\n` +
      `• **Safe Escrow**: We hold your payment securely until you receive and inspect your parcel.\n` +
      `• **48-Hour Inspection Window**: You have 2 days from delivery to verify your item. If it’s damaged or not as described, tap "I have an issue" to pause payout.\n` +
      `• **Full Refund Guarantee**: If an item never arrives or is counterfeit, you get a full refund including shipping fees.`,
  },
  {
    keywords: ['payout', 'withdraw', 'bank', 'easypaisa', 'jazzcash', 'wallet', 'funds', 'seller money'],
    title: 'Seller Payouts & Wallet',
    answer:
      `💳 **Seller Payouts**\n\n` +
      `• Once the buyer confirms delivery (or 48h after courier delivery), funds are released to your **Grabsty Balance**.\n` +
      `• You can instantly withdraw to any Pakistani Bank Account, JazzCash, or Easypaisa.\n` +
      `• Withdrawals are processed within 24 business hours with zero hidden deduction fees.`,
  },
  {
    keywords: ['bundle', 'discount', 'multiple', 'combine'],
    title: 'Bundles & Combined Shipping',
    answer:
      `🛍️ **Bundle Discounts & Combined Shipping**\n\n` +
      `• You can bundle up to 10 items from the same seller to save on shipping fees.\n` +
      `• Tap **Shop Bundle** on any listing to add more pieces from that seller's closet.\n` +
      `• You can send a single bundle offer with your desired total price!`,
  },
  {
    keywords: ['report', 'scam', 'fake', 'counterfeit', 'fraud', 'abuse', 'harass', 'block'],
    title: 'Safety & Reporting',
    answer:
      `🚫 **Safety & Reporting Policy**\n\n` +
      `• Grabsty maintains a zero-tolerance policy against scams, replicas, and harassment.\n` +
      `• Tap the **•••** menu at the top right of any chat or listing to report.\n` +
      `• Our moderation team reviews all reports within 2 hours. Never transfer money outside the Grabsty checkout system.`,
  },
  {
    keywords: ['offer', 'negotiate', 'bargain', 'counter'],
    title: 'Offers & Negotiations',
    answer:
      `🤝 **Making & Countering Offers**\n\n` +
      `• Buyers can offer up to 25 times per day to keep closet discussions active.\n` +
      `• When a seller accepts your offer, you have 24 hours to complete checkout before the item is unlocked for other buyers.\n` +
      `• Sellers can accept, decline, or counter with their preferred price directly in chat.`,
  },
];

export const SUPPORT_DEFAULT_REPLY =
  `👋 **Hi there! I'm the Grabsty Support Assistant.**\n\n` +
    `Thank you for reaching out. Here are the most common things I can assist you with right away:\n\n` +
    `• **"Track my order"** — Live status, courier info and delivery estimates\n` +
    `• **"Buyer Protection"** — Refunds, damaged items & safety policies\n` +
    `• **"Seller Payouts"** — Bank, JazzCash, Easypaisa withdrawal timelines\n` +
    `• **"Shipping Guide"** — Packaging, labels & drop-off points\n\n` +
    `Please type your question or specify what you need help with, and our team will ensure you're taken care of!`;

export const SUPPORT_WELCOME_MESSAGE =
  `👋 Welcome to Grabsty Support!\n\n` +
      `How can we assist you today? Feel free to ask about your orders, Buyer Protection, payments, or selling on Grabsty.`;

/** Every text the support bot is allowed to post, keyed for the database. */
export const SUPPORT_BOT_REPLIES: { key: string; content: string }[] = [
  { key: 'welcome', content: SUPPORT_WELCOME_MESSAGE },
  { key: 'default', content: SUPPORT_DEFAULT_REPLY },
  ...SUPPORT_KNOWLEDGE_BASE.map((item) => ({
    key: item.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    content: item.answer,
  })),
];
