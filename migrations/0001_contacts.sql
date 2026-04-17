-- Contact enquiry storage
-- Apply with: wrangler d1 execute outback-contact-db-dev --file=./migrations/0001_contacts.sql

CREATE TABLE IF NOT EXISTS contacts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL,
  phone          TEXT    NOT NULL DEFAULT '',
  enquiry        TEXT    NOT NULL,
  preferred_date TEXT    NOT NULL DEFAULT '',
  message        TEXT    NOT NULL,
  ip_hash        TEXT    NOT NULL DEFAULT '',
  request_id     TEXT    NOT NULL,
  created_at     TEXT    NOT NULL,
  processed_at   TEXT,
  status         TEXT    NOT NULL DEFAULT 'pending' -- pending | sent | failed
);

CREATE INDEX IF NOT EXISTS idx_contacts_email      ON contacts (email);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts (created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_status     ON contacts (status);
