CREATE TABLE IF NOT EXISTS autopost_channels (
  id INTEGER PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  create_time INTEGER NOT NULL DEFAULT (unixepoch())
  );

CREATE TABLE IF NOT EXISTS autopost_seen_messages (
  id INTEGER PRIMARY KEY,
  session_path VARCHAR(255) NOT NULL,
  message_key VARCHAR(1024) NOT NULL,
  create_time INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(session_path, message_key)
  );

CREATE TABLE IF NOT EXISTS championship_standings (
  id INTEGER PRIMARY KEY,
  type INTEGER NOT NULL UNIQUE,
  data JSON NOT NULL,
  create_time INTEGER NOT NULL DEFAULT (unixepoch())
  );

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  create_time INTEGER NOT NULL DEFAULT (unixepoch())
  );

CREATE TABLE IF NOT EXISTS driver_list (
  racing_number INTEGER PRIMARY KEY,
  reference VARCHAR(255) NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  broadcast_name VARCHAR(255) NOT NULL,
  tla VARCHAR(255) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  team_color VARCHAR(255) NOT NULL
  );

CREATE TABLE IF NOT EXISTS event_type (
  id INTEGER PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE
  );

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  meeting_name VARCHAR(255) NOT NULL,
  event_type_id INTEGER NOT NULL,
  start_time INTEGER NOT NULL,
  event_slug VARCHAR(255) NOT NULL UNIQUE,
  FOREIGN KEY (event_type_id) REFERENCES event_type (id)
  );

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL,
  path VARCHAR(255) NOT NULL UNIQUE,
  data JSON NOT NULL,
  create_time INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (event_id) REFERENCES events (id)
  );

CREATE INDEX IF NOT EXISTS idx_events_event_type_id_start_time
  ON events (event_type_id, start_time);

CREATE INDEX IF NOT EXISTS idx_events_meeting_name_event_type_id
  ON events (meeting_name, event_type_id);

CREATE INDEX IF NOT EXISTS idx_events_start_time
  ON events (start_time);

CREATE INDEX IF NOT EXISTS idx_results_create_time
  ON results (create_time);
