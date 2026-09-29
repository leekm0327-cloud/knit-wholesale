export const BANK_BULK_LIMIT = 100;
export type BankBulkRow = {
  id: number; at: string; account: string; remark: string; amount: number;
  customerId: number | null; customerName: string; memo: string;
  status: 'ready' | 'review' | 'done'; reason: string; snapshot: string;
};
export type BankBulkResult = { id: number; status: 'posted' | 'already' | 'review'; message: string };
