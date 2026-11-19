import type Database from 'better-sqlite3';

const conflict = "출고 기록에 이미 사용된 주문 또는 송장입니다. 출고 검토에서 확인해 주세요.";

// The old order form stores a tracking number without a carrier.
export function installOrderTrackingGuard(db: Database.Database) {
  db.exec(`CREATE TRIGGER IF NOT EXISTS roastery_guard_order_tracking
    BEFORE UPDATE OF tracking_no ON orders
    WHEN trim(coalesce(NEW.tracking_no,'')) != trim(coalesce(OLD.tracking_no,''))
      AND trim(coalesce(NEW.tracking_no,'')) != ''
      AND (EXISTS(SELECT 1 FROM roastery_consignments WHERE order_id=NEW.id)
        OR EXISTS(SELECT 1 FROM roastery_consignments WHERE tracking=trim(NEW.tracking_no) AND method='parcel'))
    BEGIN SELECT RAISE(ABORT,'roastery_tracking_conflict'); END;`);
}

export function orderTrackingConflictMessage(error: unknown) {
  return error instanceof Error && error.message.includes('roastery_tracking_conflict') ? conflict : null;
}
