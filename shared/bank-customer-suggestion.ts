export type BankCustomerSuggestion =
  | { kind: 'customer'; customerId: number; name: string; count: number }
  | { kind: 'ambiguous' };
