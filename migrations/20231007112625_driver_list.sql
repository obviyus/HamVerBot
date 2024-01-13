CREATE TABLE IF NOT EXISTS driver_list (
  racing_number INTEGER NOT NULL PRIMARY KEY,
  reference TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  broadcast_name TEXT NOT NULL,
  tla TEXT NOT NULL,
  country_code TEXT NOT NULL,
  team_name TEXT NOT NULL,
  team_color TEXT NOT NULL
);