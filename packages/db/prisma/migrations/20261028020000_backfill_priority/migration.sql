-- Backfill: deadline within 14 days of submission counts as urgent.
UPDATE "intakes"
SET "priority" = 'urgent',
    "priorityReason" = 'Delivery date is within 14 days of submission.'
WHERE julianday("timeline") - julianday(date("created_at")) <= 14;
