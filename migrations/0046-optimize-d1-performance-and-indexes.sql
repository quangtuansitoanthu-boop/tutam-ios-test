-- Migration 0046: Optimize D1 query indexing, eliminate full table scans, and minimize rows read

-- 1. Index cho luot_xem để tối ưu hóa truy vấn Top Sách xem nhiều nhất trên Trang chủ
CREATE INDEX IF NOT EXISTS idx_luot_xem_so_luot
  ON luot_xem(so_luot DESC, bai_viet_id);

-- 2. Partial index cho album_play_totals để tối ưu hóa truy vấn Top Pháp thoại nghe nhiều nhất
CREATE INDEX IF NOT EXISTS idx_album_play_totals_play_count
  ON album_play_totals(play_count DESC, album_id)
  WHERE play_count > 0;

-- 3. Expression indexes cho baiviet phục vụ kiểm tra tham chiếu media khi dọn rác
CREATE INDEX IF NOT EXISTS idx_baiviet_clean_anh_url ON baiviet(
  CASE WHEN instr(anh_url, '#pos=') > 0 THEN substr(anh_url, 1, instr(anh_url, '#pos=') - 1) ELSE anh_url END
) WHERE anh_url <> '';

CREATE INDEX IF NOT EXISTS idx_baiviet_clean_pdf_url ON baiviet(
  CASE WHEN instr(pdf_url, '#pos=') > 0 THEN substr(pdf_url, 1, instr(pdf_url, '#pos=') - 1) ELSE pdf_url END
) WHERE pdf_url IS NOT NULL AND pdf_url <> '';

-- 4. Composite index cho baiviet phục vụ phân trang catalog updates (tương xứng với idx_phap_thoai ở 0037)
CREATE INDEX IF NOT EXISTS idx_baiviet_trang_thai_created_at_id
  ON baiviet(trang_thai, created_at ASC, id ASC);

-- 5. Composite index cho active_visitors hỗ trợ subquery heartbeat theo mạng
CREATE INDEX IF NOT EXISTS idx_active_visitors_network_last_seen
  ON active_visitors(network_hash, last_seen_at ASC);

-- 6. Partial index cho practice_sessions hỗ trợ xếp hạng tu tập và thống kê
CREATE INDEX IF NOT EXISTS idx_practice_sessions_accepted_completed
  ON practice_sessions(owner_id, completed_at, activity_type, source_kind, source_id, accepted_count)
  WHERE status = 'completed' AND verification_result = 'accepted';

