import type { CloudflareEnvLike } from '../cloudflare-context';
import type { VeganLogRow, VeganPreferencesRow, VeganStreakRow, MealType } from '$lib/contracts/vegan';

// ── Preferences ───────────────────────────────────────────────────────────────

export function createVeganPreferencesRepository(env: CloudflareEnvLike) {
  return {
    get(ownerId: string) {
      return env.DB.prepare(`
        SELECT owner_id, exclude_five_pungents, difficulty_max, dietary_notes, updated_at
        FROM vegan_menu_preferences WHERE owner_id = ?
      `).bind(ownerId).first<VeganPreferencesRow>();
    },

    upsert(
      ownerId: string,
      excludeFivePungents: boolean,
      difficultyMax: string,
      dietaryNotes: string,
      now: string,
    ) {
      return env.DB.prepare(`
        INSERT INTO vegan_menu_preferences
          (owner_id, exclude_five_pungents, difficulty_max, dietary_notes, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_id) DO UPDATE SET
          exclude_five_pungents = excluded.exclude_five_pungents,
          difficulty_max        = excluded.difficulty_max,
          dietary_notes         = excluded.dietary_notes,
          updated_at            = excluded.updated_at
      `).bind(ownerId, excludeFivePungents ? 1 : 0, difficultyMax, dietaryNotes, now).run();
    },
  };
}

// ── Streaks ───────────────────────────────────────────────────────────────────

export function createVeganStreakRepository(env: CloudflareEnvLike) {
  return {
    get(ownerId: string) {
      return env.DB.prepare(`
        SELECT owner_id, current_streak, longest_streak, last_vegan_date, total_vegan_days, updated_at
        FROM vegan_streaks WHERE owner_id = ?
      `).bind(ownerId).first<VeganStreakRow>();
    },

    /** Atomic upsert after a vegan log is recorded. Caller computes new streak values. */
    upsert(
      ownerId: string,
      currentStreak: number,
      longestStreak: number,
      lastVeganDate: string,
      totalVeganDays: number,
      now: string,
    ) {
      return env.DB.prepare(`
        INSERT INTO vegan_streaks
          (owner_id, current_streak, longest_streak, last_vegan_date, total_vegan_days, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_id) DO UPDATE SET
          current_streak   = excluded.current_streak,
          longest_streak   = MAX(vegan_streaks.longest_streak, excluded.longest_streak),
          last_vegan_date  = excluded.last_vegan_date,
          total_vegan_days = excluded.total_vegan_days,
          updated_at       = excluded.updated_at
      `).bind(ownerId, currentStreak, longestStreak, lastVeganDate, totalVeganDays, now).run();
    },
  };
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export function createVeganLogRepository(env: CloudflareEnvLike) {
  return {
    /** Logs for a date range; used to populate menu slots and compute streak. */
    listByDateRange(ownerId: string, fromDate: string, toDate: string) {
      return env.DB.prepare(`
        SELECT id, owner_id, dish_id, log_date, meal_type, cooked, created_at
        FROM vegan_logs
        WHERE owner_id = ? AND log_date >= ? AND log_date <= ?
        ORDER BY log_date, meal_type
        LIMIT 42
      `).bind(ownerId, fromDate, toDate).all<VeganLogRow>();
    },

    /** Most recent log per meal_type for a single date — streak check helper. */
    getForDate(ownerId: string, date: string) {
      return env.DB.prepare(`
        SELECT id, dish_id, log_date, meal_type, cooked FROM vegan_logs
        WHERE owner_id = ? AND log_date = ?
        LIMIT 3
      `).bind(ownerId, date).all<Pick<VeganLogRow, 'id' | 'dish_id' | 'log_date' | 'meal_type' | 'cooked'>>();
    },

    /** Idempotent upsert (unique on owner_id + log_date + meal_type). */
    upsert(
      id: string,
      ownerId: string,
      dishId: string,
      logDate: string,
      mealType: MealType,
      cooked: boolean,
      now: string,
    ) {
      return env.DB.prepare(`
        INSERT INTO vegan_logs (id, owner_id, dish_id, log_date, meal_type, cooked, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, log_date, meal_type) DO UPDATE SET
          dish_id    = excluded.dish_id,
          cooked     = excluded.cooked,
          updated_at = excluded.updated_at
        RETURNING id, dish_id, log_date, meal_type, cooked, created_at, updated_at
      `).bind(id, ownerId, dishId, logDate, mealType, cooked ? 1 : 0, now, now)
        .first<VeganLogRow>();
    },

    /** Logs for the past N days — used to calculate current streak. */
    recentDates(ownerId: string, limit: number) {
      return env.DB.prepare(`
        SELECT DISTINCT log_date FROM vegan_logs
        WHERE owner_id = ?
        ORDER BY log_date DESC
        LIMIT ?
      `).bind(ownerId, limit).all<{ log_date: string }>();
    },
  };
}
