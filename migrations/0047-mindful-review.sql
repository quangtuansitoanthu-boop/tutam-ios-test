-- Local additive review schema. Deploy every shared reader/writer compatibly before enabling
-- the 48-hour promise; older writers are quarantined as unknown, never auto-published.
ALTER TABLE mindful_posts ADD COLUMN review_state TEXT NOT NULL DEFAULT 'legacy'
  CHECK (review_state IN ('legacy','pending','approved','rejected','auto_approved','removed'));
ALTER TABLE mindful_posts ADD COLUMN review_due_at TEXT;
ALTER TABLE mindful_posts ADD COLUMN review_revision INTEGER NOT NULL DEFAULT 1 CHECK (review_revision >= 1);
ALTER TABLE mindful_posts ADD COLUMN reviewed_by TEXT;
ALTER TABLE mindful_posts ADD COLUMN reviewed_at TEXT;
ALTER TABLE mindful_posts ADD COLUMN published_at TEXT;
ALTER TABLE mindful_posts ADD COLUMN review_operation_id TEXT;
ALTER TABLE mindful_posts ADD COLUMN policy_state TEXT NOT NULL DEFAULT 'unknown' CHECK (policy_state IN ('unknown','clear','blocked'));
ALTER TABLE mindful_posts ADD COLUMN policy_code TEXT;

CREATE INDEX idx_mindful_publication ON mindful_posts(kind,COALESCE(published_at,created_at) DESC,id DESC) WHERE status='published';
CREATE INDEX idx_mindful_publication_all ON mindful_posts(COALESCE(published_at,created_at) DESC,id DESC) WHERE status='published';
CREATE INDEX idx_mindful_review_due ON mindful_posts(review_due_at,id) WHERE status='hidden' AND review_state='pending' AND policy_state='clear';
CREATE INDEX idx_mindful_review_feed ON mindful_posts(kind,review_due_at DESC,id DESC) WHERE status='hidden' AND review_state='pending' AND policy_state='clear';
CREATE INDEX idx_mindful_review_queue ON mindful_posts(review_state,created_at DESC,id DESC);
CREATE INDEX idx_mindful_review_queue_kind ON mindful_posts(kind,review_state,created_at DESC,id DESC);
CREATE INDEX idx_mindful_review_unknown ON mindful_posts(created_at DESC,id DESC) WHERE status='hidden' AND review_state='pending' AND policy_state='unknown';
CREATE INDEX idx_mindful_review_unknown_kind ON mindful_posts(kind,created_at DESC,id DESC) WHERE status='hidden' AND review_state='pending' AND policy_state='unknown';
CREATE INDEX idx_mindful_pending_time ON mindful_posts(created_at DESC,id DESC) WHERE status='hidden' AND review_state='pending' AND policy_state='clear';
CREATE INDEX idx_mindful_pending_kind_time ON mindful_posts(kind,created_at DESC,id DESC) WHERE status='hidden' AND review_state='pending' AND policy_state='clear';
CREATE INDEX idx_mindful_review_operation ON mindful_posts(review_operation_id);

-- AUTOINCREMENT is the durable submission fence even when the highest post is hard-deleted.
-- Revision zero records submission metadata only, never the private journal or submitted body.
CREATE TABLE mindful_moderation_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES mindful_posts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  operation_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submitted','approve','reject','delete','auto_approve','policy_remove')),
  actor_id TEXT,
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  policy_code TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(post_id,revision)
);
CREATE INDEX idx_mindful_audit_operation ON mindful_moderation_audit(operation_id,post_id);

CREATE TABLE mindful_moderation_operations (
  operation_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind TEXT CHECK (kind IS NULL OR kind IN ('repentance','good_deed')),
  cutoff TEXT NOT NULL,
  snapshot_sequence INTEGER NOT NULL,
  pending_count INTEGER NOT NULL DEFAULT 0 CHECK (pending_count BETWEEN 0 AND 100),
  next_cursor TEXT,
  last_cursor TEXT,
  last_updated INTEGER NOT NULL DEFAULT 0,
  last_conflicted INTEGER NOT NULL DEFAULT 0,
  last_response_cursor TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_mindful_operations_expiry ON mindful_moderation_operations(expires_at,operation_id);

CREATE TRIGGER mindful_submission_audit AFTER INSERT ON mindful_posts BEGIN
  INSERT INTO mindful_moderation_audit(post_id,revision,operation_id,action,created_at)
    VALUES(NEW.id,0,'submission:' || NEW.id,'submitted',NEW.created_at);
END;
CREATE TRIGGER mindful_legacy_writer_review AFTER INSERT ON mindful_posts WHEN NEW.review_state='legacy' AND NEW.status<>'removed' BEGIN
  UPDATE mindful_posts SET status='hidden',review_state='pending',policy_state='unknown',
    review_due_at=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'+48 hours') WHERE id=NEW.id;
END;
