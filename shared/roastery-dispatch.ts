export type DispatchMethod = 'parcel' | 'quick' | 'direct';
export type DispatchCompletion = 'partial' | 'complete';

export type Consignment = {
  id: number;
  method: DispatchMethod;
  carrier: string;
  tracking: string;
  createdAt: number;
  completion: DispatchCompletion;
};

export type DispatchSummary = {
  revision: string;
  status: 'open' | 'partial' | 'complete' | 'review_required';
  consignments: Consignment[];
};
