import assert from 'node:assert/strict';
import { isSupplierSettlement } from '../../shared/bank-supplier-settlement';
assert(isSupplierSettlement({remark:'장형순(클라리멘토(',deposit:0,withdraw:1}));
assert(isSupplierSettlement({remark:'클 라 리 멘 토',deposit:0,withdraw:1}));
assert(!isSupplierSettlement({remark:'클라리멘토 환불',deposit:1,withdraw:0}));
assert(!isSupplierSettlement({remark:'장형순',deposit:0,withdraw:1}));
assert(!isSupplierSettlement({remark:'매일유업',deposit:0,withdraw:1}));
console.log('PASS supplier settlement detection and refund/unrelated payment isolation');
