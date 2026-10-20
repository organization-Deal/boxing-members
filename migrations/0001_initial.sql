-- DEAL! Boxing Membership — Independent from QR BOX / AKI / T-DEV
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  marketing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0, 1)),
  privacy_accepted_at TEXT NOT NULL,
  marketing_changed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_last_login ON members(last_login_at);

-- A lean machine reference table. Location Master remains in Lark.
CREATE TABLE IF NOT EXISTS machines (
  machine_code TEXT PRIMARY KEY,
  location_code TEXT,
  location_name TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_machines_location ON machines(location_code);

-- Check-ins only; they DO NOT prove payment or game play.
CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  machine_code TEXT NOT NULL REFERENCES machines(machine_code),
  checked_in_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkins_member_time ON checkins(member_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_machine_time ON checkins(machine_code, checked_in_at DESC);

CREATE TABLE IF NOT EXISTS marketing_consent_events (
  id TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  opted_in INTEGER NOT NULL CHECK (opted_in IN (0, 1)),
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consent_member_time ON marketing_consent_events(member_id, created_at DESC);
