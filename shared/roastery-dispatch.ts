export type DispatchMethod = 'parcel' | 'quick' | 'direct';
export type DispatchCompletion = 'partial' | 'complete';

export const MAX_TRACKINGS_PER_DISPATCH = 30;
export const trackingSeparators = /[ \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\u002d\u00ad\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g;

/** Keep leading zeroes. Leave letters and other unexpected characters for validation. */
export function normalizeTrackingNumber(value: string): string {
  return value.trim().replace(trackingSeparators, '');
}

export type Consignment = {
  id: number;
  method: DispatchMethod;
  carrier: string;
  tracking: string;
  trackings: string[];
  createdAt: number;
  completion: DispatchCompletion;
};

export type DispatchSummary = {
  revision: string;
  status: 'open' | 'partial' | 'complete' | 'review_required';
  consignments: Consignment[];
};
