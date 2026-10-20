-- Add ONLY administrator permissions and useful read indexes; never copy member records.
CREATE TABLE IF NOT EXISTS admin_users (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('viewer','owner')),
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_checkins_member_time ON checkins(member_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_machine_time ON checkins(machine_code, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_machines_location ON machines(location_code);
CREATE INDEX IF NOT EXISTS idx_members_last_login ON members(last_login_at);
CREATE INDEX IF NOT EXISTS idx_consent_member_time ON marketing_consent_events(member_id, created_at DESC);
