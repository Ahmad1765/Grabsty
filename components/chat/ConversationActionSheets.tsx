// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION ACTION SHEETS & MODALS (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Grouping Contextual Overlays
// Instead of cluttering the main screen's JSX with multiple bottom sheet overlays,
// this component groups all conversation-level action sheets, prompt dialogs,
// and offer submission modals in one dedicated place.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { ChatActionSheet, type ChatAction } from './ChatActionSheet';
import { OfferSheet } from '@/components/product/OfferSheet';
import type { OfferRange } from '@/components/product/offerHelpers';
import { REPORT_REASONS } from '@/lib/reports';
import { BLOCK_REASONS } from '@/lib/blocks';

type ConversationActionSheetsProps = {
  plusOpen: boolean;
  plusActions: ChatAction[];
  onClosePlus: () => void;

  overflowOpen: boolean;
  overflowActions: ChatAction[];
  onCloseOverflow: () => void;

  reportOpen: boolean;
  onCloseReport: () => void;
  onSelectReportReason: (reasonId: string) => void;

  blockSheetOpen: boolean;
  onCloseBlockSheet: () => void;
  onSelectBlockReason: (reasonLabel: string) => void;

  offerVisible: boolean;
  listingPrice: number | null | undefined;
  listingTitle: string | null | undefined;
  listingThumb: string | null | undefined;
  /** Set when countering, so the counter stays between the two sides' amounts. */
  offerRange?: OfferRange;
  onCloseOffer: () => void;
  onSubmitOffer: (amount: number) => Promise<void> | void;
};

export const ConversationActionSheets = memo(function ConversationActionSheets({
  plusOpen,
  plusActions,
  onClosePlus,
  overflowOpen,
  overflowActions,
  onCloseOverflow,
  reportOpen,
  onCloseReport,
  onSelectReportReason,
  blockSheetOpen,
  onCloseBlockSheet,
  onSelectBlockReason,
  offerVisible,
  listingPrice,
  listingTitle,
  listingThumb,
  offerRange,
  onCloseOffer,
  onSubmitOffer,
}: ConversationActionSheetsProps) {
  return (
    <>
      <ChatActionSheet
        visible={plusOpen}
        actions={plusActions}
        onClose={onClosePlus}
      />

      <ChatActionSheet
        visible={overflowOpen}
        actions={overflowActions}
        onClose={onCloseOverflow}
      />

      <ChatActionSheet
        visible={reportOpen}
        title="WHY ARE YOU REPORTING THIS?"
        actions={REPORT_REASONS.map((r) => ({
          id: r.id,
          label: r.label,
          icon: 'flag' as const,
          onPress: () => onSelectReportReason(r.id),
        }))}
        onClose={onCloseReport}
      />

      <ChatActionSheet
        visible={blockSheetOpen}
        title="WHY ARE YOU BLOCKING THIS USER?"
        actions={BLOCK_REASONS.map((r) => ({
          id: r.id,
          label: r.label,
          hint: r.hint,
          icon: r.icon as any,
          tone: 'destructive' as const,
          onPress: () => onSelectBlockReason(r.label),
        }))}
        onClose={onCloseBlockSheet}
      />

      <OfferSheet
        visible={offerVisible}
        askingPrice={listingPrice ?? null}
        title={listingTitle ?? null}
        imageUrl={listingThumb ?? null}
        onClose={onCloseOffer}
        onSubmit={onSubmitOffer}
        range={offerRange}
      />
    </>
  );
});
