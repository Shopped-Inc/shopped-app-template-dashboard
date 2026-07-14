CREATE TABLE dashboard_state (
  id integer PRIMARY KEY CHECK (id = 1),
  open_work integer NOT NULL DEFAULT 18 CHECK (open_work >= 0),
  completed_today integer NOT NULL DEFAULT 42 CHECK (completed_today >= 0),
  on_time_rate double precision NOT NULL DEFAULT 0.94 CHECK (on_time_rate >= 0 AND on_time_rate <= 1),
  refresh_count bigint NOT NULL DEFAULT 0 CHECK (refresh_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
