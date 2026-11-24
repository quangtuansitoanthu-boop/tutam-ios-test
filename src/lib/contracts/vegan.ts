// ─── Vegan Feature Contracts ─────────────────────────────────────────────────
// Zod schemas + TypeScript interfaces shared between client and server.

// ── Static data types (bundled JSON, no D1) ──────────────────────────────────

export const MEAL_TYPES = ['morning', 'noon', 'evening'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export interface VeganIngredient {
  name: string;         // e.g. "Đậu hũ non"
  amount: string;       // e.g. "200g"
  note?: string;        // e.g. "không ngâm nước"
}

export interface VeganNutrition {
  protein_g: number;
  fiber_g: number;
  calories_kcal: number;
  highlight: string;    // e.g. "Giàu protein thực vật, canxi"
}

export interface VeganDish {
  id: string;             // e.g. "dish_01"
  name: string;           // e.g. "Cháo đậu xanh"
  meal_types: MealType[]; // món có thể dùng cho bữa nào
  difficulty: DifficultyLevel;
  cook_time_min: number;
  is_pure_vegan: boolean; // true = không ngũ tân
  ingredients: VeganIngredient[];
  steps: string[];        // 3-5 bước ngắn gọn
  nutrition: VeganNutrition;
  tags: string[];         // e.g. ["thanh đạm", "dễ nấu", "giải nhiệt"]
  emoji: string;          // hiển thị thay ảnh, e.g. "🫘"
}

// ── Week menu types (generated client-side from seed) ────────────────────────

export interface WeekMenuSlot {
  date: string;           // 'YYYY-MM-DD'
  day_label: string;      // 'T2', 'T3', ... 'CN'
  meal_type: MealType;
  dish_id: string;
  is_logged: boolean;     // đã log bữa này chưa (populated server-side for auth users)
  is_cooked: boolean;
}

export interface WeekMenu {
  week: string;           // 'YYYY-WW'
  slots: WeekMenuSlot[];  // 7 days × 3 meals = 21 slots
}

// ── D1 Row types ─────────────────────────────────────────────────────────────

export interface VeganPreferencesRow {
  owner_id: string;
  exclude_five_pungents: number;  // SQLite INTEGER (0|1)
  difficulty_max: DifficultyLevel;
  dietary_notes: string;
  updated_at: string;
}

export interface VeganStreakRow {
  owner_id: string;
  current_streak: number;
  longest_streak: number;
  last_vegan_date: string | null;
  total_vegan_days: number;
  updated_at: string;
}

export interface VeganLogRow {
  id: string;
  owner_id: string;
  dish_id: string;
  log_date: string;
  meal_type: MealType;
  cooked: number;         // SQLite 0|1
  created_at: string;
  updated_at: string;
}

// ── API response shapes ───────────────────────────────────────────────────────

export interface VeganMenuResponse {
  week: string;
  slots: WeekMenuSlot[];
  preferences: VeganPreferencesDto | null; // null for guests
}

export interface VeganStreakDto {
  currentStreak: number;
  longestStreak: number;
  lastVeganDate: string | null;
  totalVeganDays: number;
}

export interface VeganPreferencesDto {
  excludeFivePungents: boolean;
  difficultyMax: DifficultyLevel;
  dietaryNotes: string;
}

export interface VeganLogWriteDto {
  dishId: string;
  logDate: string;        // 'YYYY-MM-DD'
  mealType: MealType;
  cooked: boolean;
  clientLogId: string;    // idempotency key
}

export interface VeganShoppingItem {
  name: string;
  amounts: string[];      // merged across all dishes using this ingredient
  dish_names: string[];   // source dishes
}

export interface VeganShoppingListResponse {
  week: string;
  items: VeganShoppingItem[];
}
