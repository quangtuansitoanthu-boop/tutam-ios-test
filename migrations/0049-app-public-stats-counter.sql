-- Chạy cả bootstrap và trigger trong một transaction của migration runner.
-- Visitor là distinct hash còn trong daily presence, không phải số cài đặt trọn đời.
CREATE TABLE app_public_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_count INTEGER NOT NULL CHECK (user_count >= 0),
  visitor_count INTEGER NOT NULL CHECK (visitor_count >= 0)
);

CREATE INDEX idx_visitor_daily_presence_visitor_date
  ON visitor_daily_presence(visitor_id_hash, visit_date);

INSERT INTO app_public_stats (id, user_count, visitor_count)
SELECT 1, (SELECT COUNT(*) FROM app_users),
  (SELECT COUNT(DISTINCT visitor_id_hash) FROM visitor_daily_presence);

CREATE TRIGGER app_public_stats_user_insert AFTER INSERT ON app_users BEGIN
  UPDATE app_public_stats SET user_count = user_count + 1 WHERE id = 1;
END;

CREATE TRIGGER app_public_stats_user_delete AFTER DELETE ON app_users BEGIN
  UPDATE app_public_stats SET user_count = user_count - 1 WHERE id = 1;
END;

CREATE TRIGGER app_public_stats_visitor_insert AFTER INSERT ON visitor_daily_presence
WHEN NOT EXISTS (SELECT 1 FROM visitor_daily_presence
  WHERE visitor_id_hash = NEW.visitor_id_hash AND visit_date <> NEW.visit_date)
BEGIN
  UPDATE app_public_stats SET visitor_count = visitor_count + 1 WHERE id = 1;
END;

CREATE TRIGGER app_public_stats_visitor_delete AFTER DELETE ON visitor_daily_presence
WHEN NOT EXISTS (SELECT 1 FROM visitor_daily_presence WHERE visitor_id_hash = OLD.visitor_id_hash)
BEGIN
  UPDATE app_public_stats SET visitor_count = visitor_count - 1 WHERE id = 1;
END;

CREATE TRIGGER app_public_stats_visitor_hash_update AFTER UPDATE OF visitor_id_hash ON visitor_daily_presence
WHEN OLD.visitor_id_hash <> NEW.visitor_id_hash
BEGIN
  UPDATE app_public_stats SET visitor_count = visitor_count
    - (NOT EXISTS (SELECT 1 FROM visitor_daily_presence WHERE visitor_id_hash = OLD.visitor_id_hash))
    + (NOT EXISTS (SELECT 1 FROM visitor_daily_presence
        WHERE visitor_id_hash = NEW.visitor_id_hash AND visit_date <> NEW.visit_date))
  WHERE id = 1;
END;
