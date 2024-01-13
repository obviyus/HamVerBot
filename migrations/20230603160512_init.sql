CREATE TABLE IF NOT EXISTS event_type (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

INSERT INTO
  event_type (name)
VALUES
  ('Livery Reveal'),
  ('Practice 1'),
  ('Practice 2'),
  ('Practice 3'),
  ('Qualifying'),
  ('Sprint'),
  ('Race');

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_name TEXT NOT NULL,
  event_type_id INTEGER NOT NULL,
  start_time INTEGER NOT NULL,
  event_slug TEXT NOT NULL UNIQUE,
  FOREIGN KEY (event_type_id) REFERENCES event_type (id)
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  path TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  create_time INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events (id)
);

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  create_time INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
);