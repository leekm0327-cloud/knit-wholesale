export type OrderInvoiceSummary = {
  orderId: number;
  eligible: boolean;
  draftId: string | null;
  state: string;
  reason: 'cancelled' | 'sample' | 'internal' | 'nonpositive' | 'pending' | null;
};
