-- Migration 0060: Ăn Chay Thanh Tịnh
-- NOTE: vegan_dishes data is BUNDLED as static JSON (src/lib/domain/vegan/dishes.json)
-- Only user-state tables live in D1 to minimise D1 reads.

-- ─── User Preferences ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vegan_menu_preferences (
  owner_id              TEXT    NOT NULL PRIMARY KEY, -- FK → users(id)
  exclude_five_pungents INTEGER NOT NULL DEFAULT 1,   -- 1 = loại ngũ tân (tỏi/hành/kiệu/nén/hẹ)
  difficulty_max        TEXT    NOT NULL DEFAULT 'medium', -- 'easy' | 'medium' | 'hard'
  dietary_notes         TEXT    NOT NULL DEFAULT '',  -- ghi chú thêm (plain text, ≤500 chars)
  updated_at            TEXT    NOT NULL              -- ISO-8601 UTC
);

-- ─── Vegan Streaks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vegan_streaks (
  owner_id         TEXT    NOT NULL PRIMARY KEY,
  current_streak   INTEGER NOT NULL DEFAULT 0,
  longest_streak   INTEGER NOT NULL DEFAULT 0,
  last_vegan_date  TEXT    NULL,     -- 'YYYY-MM-DD' local date (Vietnam TZ)
  total_vegan_days INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT    NOT NULL
);

-- ─── Meal Logs ───────────────────────────────────────────────────────────────
-- dish_id references static JSON (bundled); no FK constraint possible.
CREATE TABLE IF NOT EXISTS vegan_logs (
  id         TEXT    NOT NULL PRIMARY KEY,            -- nanoid / UUID v4
  owner_id   TEXT    NOT NULL,
  dish_id    TEXT    NOT NULL,                        -- references bundled dishes.json id
  log_date   TEXT    NOT NULL,                        -- 'YYYY-MM-DD'
  meal_type  TEXT    NOT NULL                         -- 'morning' | 'noon' | 'evening'
               CHECK (meal_type IN ('morning', 'noon', 'evening')),
  cooked     INTEGER NOT NULL DEFAULT 0,              -- 0 = chưa nấu, 1 = đã nấu
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS vegan_logs_owner_date
  ON vegan_logs (owner_id, log_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS vegan_logs_owner_date_meal
  ON vegan_logs (owner_id, log_date, meal_type);     -- mỗi bữa chỉ 1 log

-- ─── Notes ───────────────────────────────────────────────────────────────────
-- vegan_dishes table is NOT created here — data is bundled as static JSON.
-- See src/lib/domain/vegan/dishes.json and src/lib/domain/vegan/dishes.ts.
-- Benefits: 0 D1 reads for dish list/detail, works offline, predictable cost.
-- Tradeoff: updating dishes requires a new deploy (acceptable for ~30 dishes).
