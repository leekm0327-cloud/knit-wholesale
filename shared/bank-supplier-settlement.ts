/** Factory invoices are already included in purchase COGS. Their settlement is not a new expense. */
export function isSupplierSettlement(row: { remark?: string; withdraw: number; deposit: number }): boolean {
  const name = (row.remark || '').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '');
  return row.withdraw > 0 && row.deposit === 0 && name.includes('클라리멘토');
}
export const supplierSettlementMessage = '클라리멘토 공장 지급은 발주 원가에 포함되므로 비용을 다시 추가할 수 없습니다. 공장 지급 내역에서 확인해 주세요.';
