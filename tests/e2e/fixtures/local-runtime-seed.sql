PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO migration_runs (
  id, source_sql_sha256, source_manifest_sha256, status,
  started_at, imported_at, verified_at, sealed_at
) VALUES (
  'e2e-sealed', 'e2e-source', 'e2e-manifest', 'sealed',
  '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z',
  '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'
);

DELETE FROM baiviet WHERE id IN ('e2e-public', 'e2e-ebook', 'e2e-practice', 'e2e-pdf');

INSERT INTO baiviet (
  id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia,
  ngay_dang, has_muc_luc, so_tap, trang_thai, tap_tieu_de,
  created_at, updated_at, pdf_url
) VALUES
  (
    'e2e-public', 'Bài viết kiểm thử E2E', 'Một bài viết công khai dùng cho kiểm thử trình duyệt.',
    '<p>Nội dung công khai giữ nguyên trong trình đọc SvelteKit.</p>', 'CHUYỆN NHÂN QUẢ',
    'e2e,nhân quả', 'Quang Từ', '2026-07-31', 0, 0, 'Hoàn thành', '[]',
    '2026-07-31T03:00:00.000Z', '2026-07-31T03:00:00.000Z', ''
  ),
  (
    'e2e-ebook', 'Sách nhiều tập E2E', 'Sách dùng để kiểm tra mục lục, EPUB và quản trị tập.',
    '<p>Lời giới thiệu sách.</p>', 'SÁCH KHUYẾN THIỆN', 'e2e,sách', 'Quang Từ',
    '2026-07-30', 1, 2, 'Hoàn thành', '["Phẩm Một","Phẩm Hai"]',
    '2026-07-31T02:00:00.000Z', '2026-07-31T02:00:00.000Z', ''
  ),
  (
    'e2e-practice', 'Kinh kiểm thử E2E', 'Bài kinh dùng cho vòng đời Tu Tập.',
    '<p>Nam mô Bổn Sư Thích Ca Mâu Ni Phật.</p>', 'KINH PHẬT', 'e2e,tu tập', 'Quang Từ',
    '2026-07-29', 1, 2, 'Hoàn thành', '["Khai kinh","Hồi hướng"]',
    '2026-07-31T01:00:00.000Z', '2026-07-31T01:00:00.000Z', ''
  ),
  (
    'e2e-pdf', 'Bài PDF kiểm thử E2E', 'PDF ba trang dùng để kiểm tra trình đọc.',
    '<p>Nội dung giới thiệu PDF.</p>', 'CHUYỆN NHÂN QUẢ', 'e2e,pdf', 'Quang Từ',
    '2026-07-28', 0, 0, 'Hoàn thành', '[]',
    '2026-07-31T00:30:00.000Z', '2026-07-31T00:30:00.000Z',
    '/assets/pdfs/bai-viet-mau-gieo-nhan-lanh.pdf'
  );

DELETE FROM luot_xem WHERE bai_viet_id IN ('e2e-public', 'e2e-ebook', 'e2e-practice', 'e2e-pdf');

INSERT INTO luot_xem (bai_viet_id, so_luot, updated_at) VALUES
  ('e2e-public', 38, '2026-07-31T03:00:00.000Z'),
  ('e2e-ebook', 72, '2026-07-31T02:00:00.000Z'),
  ('e2e-pdf', 138, '2026-07-31T00:30:00.000Z');

INSERT INTO tap_noi_dung (bai_viet_id, so_thu_tu, tieu_de, tom_tat, noi_dung, updated_at) VALUES
  ('e2e-ebook', 0, 'Phẩm Một', 'Tóm tắt phẩm một', '{align:center|**Nội dung phẩm một.**}', '2026-07-31T00:00:00.000Z'),
  ('e2e-ebook', 1, 'Phẩm Hai', 'Tóm tắt phẩm hai', '<p>Nội dung phẩm hai.</p>', '2026-07-31T00:00:00.000Z'),
  ('e2e-practice', 0, 'Khai kinh', 'Mở đầu thời khóa', '<p>Nguyện hương.</p>', '2026-07-31T00:00:00.000Z'),
  ('e2e-practice', 1, 'Hồi hướng', 'Kết thúc thời khóa', '<p>Nguyện đem công đức này.</p>', '2026-07-31T00:00:00.000Z');

DELETE FROM phap_thoai WHERE id = 'e2e-talk';

INSERT INTO phap_thoai (
  id, tieu_de, mo_ta, chu_de, archive_id, tracks, ngay_dang,
  created_at, visibility, anh_dai_dien
) VALUES (
  'e2e-talk', 'Pháp thoại kiểm thử E2E',
  'Album công khai dùng để kiểm tra phát và khóa tải xuống.',
  'Pháp ngữ', '',
  '[{"title":"Tiếng mõ kiểm thử","url":"/assets/audio/tieng-mo.m4a","duration_sec":2}]',
  '2026-07-31', '2026-07-31T04:00:00.000Z', 'public',
  '/assets/branding/tu-tap-logo.png#pos=35%25%2070%25'
);

DELETE FROM app_users WHERE id = 'e2e-google-admin';

INSERT INTO app_users (id, email, display_name, avatar_url, role, created_at, updated_at)
VALUES ('e2e-member', 'e2e-member@example.com', 'Thành viên E2E', '', 'user',
  '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');
INSERT INTO auth_sessions (id, user_id, token_hash, csrf_token_hash, created_at, expires_at)
VALUES ('e2e-member-session', 'e2e-member', '2OAOoA3EoKmRwGDCWLcvOXQon0zLvZ9xtRyQxZcVYPw',
  '0cUkjiW6mp9ervLlyL0kH2tpHkLS8Vqkhh4Q8WrEqRM', '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z');

-- Notification read-sync scenarios own separate principals and real rate-limit buckets.
INSERT INTO app_users (id, email, display_name, avatar_url, role, created_at, updated_at) VALUES
  ('e2e-notification-devices', 'e2e-notification-devices@example.com', 'Notification devices E2E', '', 'user',
   '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'),
  ('e2e-notification-reconnect', 'e2e-notification-reconnect@example.com', 'Notification reconnect E2E', '', 'user',
   '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');
INSERT INTO auth_sessions (id, user_id, token_hash, csrf_token_hash, created_at, expires_at) VALUES
  ('e2e-notification-devices-session', 'e2e-notification-devices',
   'yfp_3UN13YpNq98E7NVdFDKBR-5WbMt5Rmr_rKBcn7U', '09eF7UozMcSIQv9aXtfKFyuYgv2JbZo3fiPpHgikwpw',
   '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z'),
  ('e2e-notification-reconnect-session', 'e2e-notification-reconnect',
   '3mgl-vcfpAJJjUKVpAjUbVZnQQQssTF9_ZkYJwWFPFM', 'xq09_GyQQQ0LnDs9EJJ3XAoIVcP6L7RWuVSpGoinUYQ',
   '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z');

INSERT INTO app_users (
  id, email, display_name, avatar_url, role, created_at, updated_at
) VALUES (
  'e2e-google-admin', 'e2e-admin@example.com', 'Quản trị viên E2E', '', 'admin',
  '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'
);

-- The moderation lifecycle and refusal/retry scenarios each own their two-post daily quota.
INSERT INTO app_users (id, email, display_name, avatar_url, role, created_at, updated_at) VALUES
  ('e2e-mindful-48h-lifecycle', 'e2e-mindful-48h-lifecycle@example.com', 'Moderation lifecycle E2E', '', 'user',
   '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'),
  ('e2e-mindful-48h-retry', 'e2e-mindful-48h-retry@example.com', 'Moderation retry E2E', '', 'user',
   '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');
INSERT INTO auth_sessions (id, user_id, token_hash, csrf_token_hash, created_at, expires_at) VALUES
  ('e2e-mindful-48h-lifecycle-session', 'e2e-mindful-48h-lifecycle',
   'AGr0KEQBhPKn-bbKH6g8GNatMmQG6C_NnYgm3mGqey0', 'dXYdOT9fblhsepCvNZf6GG_HO8n3JT6Wxaa2rcdwOl4',
   '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z'),
  ('e2e-mindful-48h-retry-session', 'e2e-mindful-48h-retry',
   'Dd3mdroLGbCR2QIbqqj8jYshtDDBnnB27LAm92iWAsM', '2x11fc4F8G0oP9hy64A_MbY4nhfclS5cYk9GNcrc9x0',
   '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z');

INSERT INTO auth_identities (
  id, user_id, issuer, provider, provider_subject, created_at, updated_at, last_sign_in_at
) VALUES (
  'e2e-google-identity', 'e2e-google-admin', 'https://accounts.google.com', 'google',
  'e2e-google-admin-subject', '2026-07-31T00:00:00.000Z',
  '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'
);

INSERT INTO auth_sessions (
  id, user_id, token_hash, csrf_token_hash, created_at, expires_at
) VALUES
  (
    'e2e-album-logout-session', 'e2e-google-admin',
    'hTCY_7aNOaBG_ukG1hyqbM72dD6QzK-NEDc4xTyM5vs',
    'niBj5FQDylhfebbQcY5627qvyEBOwIRBPEozpZZD_z8',
    '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z'
  ),
  (
    'e2e-google-admin-session', 'e2e-google-admin',
    'HpDFXGHL6d-JmqMKP0sqDn07saOP2nxzlTKnL7bKltM',
    'vS0vKYDhMbLKi8OUncoFjGJ53JgQDwPGlSBql4U-oDw',
    '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z'
  ),
  (
    'e2e-audio-logout-session', 'e2e-google-admin',
    '_0ss0cRr5rCvir4XTangGHovQ_h8jC5ycbJ3wtWmuNs',
    'yjQYdk_XAiLEFDIlIIZdnAEEkMX98ajyvDF0IsjPzNU',
    '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z'
  ),
  (
    'e2e-audio-logout-mobile-390-light-session', 'e2e-google-admin',
    'bYGK24Ab0ru9u6JoATgScGe_TVpCI9ZcO5_o_ZMnCsA',
    'rzBNm46ZlOT6Rh3ML3A_6q2A4-fcsFiLTaJKcHvUBQc',
    '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z'
  ),
  (
    'e2e-audio-logout-mobile-390-dark-session', 'e2e-google-admin',
    'BEZPAFYrd5r8SQNZ4Mhxb4P-9Gr-nlRAcNxTbdeSPk8',
    'nnrQ5rltPSs600pfcyRwY7Ddd2IKpol7a-kGXRm_BAY',
    '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z'
  ),
  (
    'e2e-audio-logout-desktop-1440-dark-session', 'e2e-google-admin',
    'aIQyJhnzY8gvqjbiPZUJO8yUa4souJZUdDrhrqiOTAI',
    'MEjd9oPDYSrL78GNJzFXB2G_Xb6jfrBBCe6W-6bU_IU',
    '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z'
  ),
  (
    'e2e-practice-logout-session', 'e2e-google-admin',
    'RBx8WAKtQbNTNV-0aiHrj8Sr-fGIXWF3VFTCIopi-Ow',
    'IY-at-nT44Epf9Eg41rnAPjj-YI4HX2akHfEiomN3Ho',
    '2026-07-31T00:00:00.000Z', '2099-12-31T23:59:59.000Z'
  );

-- Modal rejection tests own this row independently of destructive Facebook tests.
DELETE FROM baiviet WHERE id = 'e2e-modal-rejection';
INSERT INTO baiviet (
  id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, ngay_dang, trang_thai,
  created_at, updated_at
) VALUES (
  'e2e-modal-rejection', 'Modal rejection fixture', 'Local modal rejection fixture',
  '<p>Original modal rejection content.</p>', 'KHÁC', 'e2e,modal', 'Local fixture', '2026-07-27', 'Chờ duyệt',
  '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
);

-- Local-only imports exercise confirmation and provenance without Graph tokens.
-- Recreated by each disposable runtime; destructive tests remove only these IDs.
DELETE FROM facebook_post_imports WHERE id IN (
  'e2e-fb-import-remove-managed', 'e2e-fb-import-remove-edited',
  'e2e-fb-import-disconnect-managed', 'e2e-fb-import-disconnect-edited'
);
DELETE FROM baiviet WHERE id IN (
  'e2e-fb-remove-managed', 'e2e-fb-remove-edited',
  'e2e-fb-disconnect-managed', 'e2e-fb-disconnect-edited'
);
INSERT INTO facebook_connections (
  id, app_user_id, facebook_display_name, source_url, status, created_at, updated_at
) VALUES (
  'e2e-fb-confirmation-connection', 'e2e-google-admin', 'Local confirmation fixture',
  'https://www.facebook.com/tranan.buhd', 'disabled',
  '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
);
INSERT INTO baiviet (
  id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, ngay_dang, trang_thai,
  created_at, updated_at
) VALUES
  ('e2e-fb-remove-managed', 'Facebook confirmation remove-managed', 'Local import confirmation fixture',
   '<p>Original imported content.</p>', 'KHÁC', 'e2e,facebook', 'Local fixture', '2026-07-27', 'Chờ duyệt',
   '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'),
  ('e2e-fb-remove-edited', 'Facebook confirmation remove-edited', 'Local import confirmation fixture',
   '<p>Locally edited content to preserve.</p>', 'KHÁC', 'e2e,facebook', 'Local fixture', '2026-07-27', 'Chờ duyệt',
   '2026-07-27T00:00:00.000Z', '2026-07-27T01:00:00.000Z'),
  ('e2e-fb-disconnect-managed', 'Facebook confirmation disconnect-managed', 'Local import confirmation fixture',
   '<p>Original imported content.</p>', 'KHÁC', 'e2e,facebook', 'Local fixture', '2026-07-27', 'Chờ duyệt',
   '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'),
  ('e2e-fb-disconnect-edited', 'Facebook confirmation disconnect-edited', 'Local import confirmation fixture',
   '<p>Locally edited content to preserve.</p>', 'KHÁC', 'e2e,facebook', 'Local fixture', '2026-07-27', 'Chờ duyệt',
   '2026-07-27T00:00:00.000Z', '2026-07-27T01:00:00.000Z');
INSERT INTO facebook_post_imports (
  id, connection_id, facebook_post_id, article_id, privacy, source_content_hash,
  article_content_hash, source_managed, status, created_at, updated_at
) VALUES
  ('e2e-fb-import-remove-managed', 'e2e-fb-confirmation-connection', 'local-remove-managed',
   'e2e-fb-remove-managed', 'EVERYONE', 'local-source', '8Yrl0BRnSgxhLhdgqgSsUzihD0Q256mLjpqyfwaN7cI',
   1, 'review', '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'),
  ('e2e-fb-import-remove-edited', 'e2e-fb-confirmation-connection', 'local-remove-edited',
   'e2e-fb-remove-edited', 'EVERYONE', 'local-source', 'yx43aWCO7jGaU17G5cIsMNl6IHbTOHiyYaQRrU3Sbso',
   1, 'review', '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'),
  ('e2e-fb-import-disconnect-managed', 'e2e-fb-confirmation-connection', 'local-disconnect-managed',
   'e2e-fb-disconnect-managed', 'EVERYONE', 'local-source', 'TXXmZjulYdjBludMCA___m211lk5iWZSGa1gRJcEGlE',
   1, 'review', '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'),
  ('e2e-fb-import-disconnect-edited', 'e2e-fb-confirmation-connection', 'local-disconnect-edited',
   'e2e-fb-disconnect-edited', 'EVERYONE', 'local-source', 'mEJ9ji40tqs-z11FJnrStC3Tl5x2jx6E4h1vNQESPss',
   1, 'review', '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z');

-- Dữ liệu phân tích cục bộ độc lập với heartbeat đã tắt trong ứng dụng.
INSERT INTO analytics_pageviews (
  pageview_id_hash, visit_date, visitor_id_hash, session_id_hash, path, started_at, last_seen_at
) VALUES (
  'e2e-analytics-pageview', date('now', '+7 hours'), 'e2e-analytics-visitor', 'e2e-analytics-session',
  '/kinh-sach', (unixepoch() - 10) * 1000, unixepoch() * 1000
);
