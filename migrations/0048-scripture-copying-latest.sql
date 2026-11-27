-- Tìm bản lưu gần nhất của tài khoản mà không quét/sắp xếp toàn bộ lịch sử.
CREATE INDEX IF NOT EXISTS idx_scripture_copy_latest
  ON scripture_copy_chapters(user_id, saved_at DESC, run_id DESC);
