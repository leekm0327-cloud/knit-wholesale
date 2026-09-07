export const supplyStates = ['needed', 'ordered', 'partial', 'received', 'cancelled', 'refund_pending', 'refunded', 'recorded'] as const;
export type SupplyState = typeof supplyStates[number];
export const supplyLabels: Record<SupplyState, string> = { needed: '발주 필요', ordered: '입고 대기', partial: '일부 입고', received: '입고 완료', cancelled: '취소', refund_pending: '환불 대기', refunded: '환불 완료', recorded: '기존 기록' };
export type SupplyRecord = {
    id: number;
    orderDate: string;
    vendor: string;
    body: string;
    amount: number;
    staffId: number;
    staffName: string;
    updatedAt: number;
    status: SupplyState;
    destination: string;
    expectedDate: string;
    link: string;
    note: string;
    receivedBy: string;
    receivedAt: number | null;
    productId: number | null;
};
export type SupplyTemplate = {
    id: number;
    name: string;
    vendor: string;
    body: string;
    link: string;
    destination: string;
};
export type BeanStock = {
    productId: number;
    name: string;
    available: number;
    tracked: number;
    grams: number | null;
    minimumGrams: number | null;
    version: number;
    updatedBy: string;
    updatedAt: number | null;
};
export type SupplyEvent = {
    id: number;
    status: SupplyState;
    note: string;
    staffName: string;
    createdAt: number;
};
