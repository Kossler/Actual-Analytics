-- Offensive linemen per week (2013 on, when snap counts start): snaps, penalties called on the
-- player, and the line's results while he was on the field. Public data doesn't say which blocker
-- allowed a sack or opened a hole, so pass and run blocking are the unit's numbers, credited by
-- the share of snaps he played: a lineman on the field for 90% of plays is credited with 90% of
-- the team's dropbacks, sacks, pressures and runs that game. Sums only, so any range adds up.

-- Build without parallel workers: parallel hash joins need shared memory, which small Postgres
-- containers (Docker's 64 MB /dev/shm default) don't have.
SET max_parallel_workers_per_gather = 0;

CREATE MATERIALIZED VIEW "player_week_ol" AS
WITH linemen AS (
  SELECT p.gsis_id AS player_id, sc.season::INT AS season, sc.week::INT AS week, sc.game_id, sc.game_type,
         sc.team, sc.position, sc.offense_snaps::FLOAT AS snaps, sc.offense_pct::FLOAT AS share
  FROM snap_counts sc
  JOIN players p ON p.pfr_id = sc.pfr_player_id
  WHERE sc.position IN ('T', 'G', 'C', 'OL', 'OT', 'OG') AND sc.offense_snaps > 0
),
team_pass AS (
  SELECT game_id, posteam AS team,
         SUM(qb_dropback)::FLOAT AS dropbacks, SUM(COALESCE(sack, 0))::FLOAT AS sacks,
         SUM(COALESCE(qb_hit, 0))::FLOAT AS qb_hits,
         SUM(epa) FILTER (WHERE qb_dropback = 1) AS pass_epa
  FROM pbp
  WHERE qb_dropback = 1 AND epa IS NOT NULL AND COALESCE(two_point_attempt, 0) = 0
  GROUP BY game_id, posteam
),
team_rush AS (
  SELECT game_id, posteam AS team,
         COUNT(*)::FLOAT AS rushes, SUM(epa) AS rush_epa, SUM(success) AS rush_success,
         COUNT(*) FILTER (WHERE yards_gained <= 0)::FLOAT AS stuffed
  FROM pbp
  WHERE rush = 1 AND epa IS NOT NULL AND COALESCE(two_point_attempt, 0) = 0
  GROUP BY game_id, posteam
),
-- Pressures charted by Pro Football Reference (2018 on), summed over the team's passers.
team_pressure AS (
  SELECT game_id, team, SUM(times_pressured)::FLOAT AS pressures
  FROM pfr_advstats_pass GROUP BY game_id, team
),
team_contact AS (
  SELECT game_id, team, SUM(rushing_yards_before_contact)::FLOAT AS ybc, SUM(carries)::FLOAT AS pfr_carries
  FROM pfr_advstats_rush GROUP BY game_id, team
),
penalties AS (
  SELECT game_id, penalty_player_id AS player_id,
         COUNT(*) FILTER (WHERE penalty_type = 'Offensive Holding')::INT AS holding,
         COUNT(*) FILTER (WHERE penalty_type = 'False Start')::INT AS false_starts,
         COUNT(*)::INT AS penalties
  FROM pbp
  WHERE penalty = 1 AND penalty_player_id IS NOT NULL AND penalty_team = posteam
  GROUP BY game_id, penalty_player_id
)
SELECT
  l.player_id, l.season, l.week,
  MAX(l.game_type) AS game_type, MAX(l.team) AS team, MAX(l.position) AS position,
  SUM(l.snaps) AS snaps,
  SUM(ROUND(l.snaps / NULLIF(l.share, 0))) AS team_snaps,
  COALESCE(SUM(pe.holding), 0)::INT AS holding,
  COALESCE(SUM(pe.false_starts), 0)::INT AS false_starts,
  COALESCE(SUM(pe.penalties), 0)::INT AS penalties,
  -- The line's results, credited by the share of snaps played.
  SUM(l.share * tp.dropbacks) AS on_dropbacks,
  SUM(l.share * tp.sacks) AS on_sacks,
  SUM(l.share * tp.qb_hits) AS on_qb_hits,
  SUM(l.share * tp.pass_epa) AS on_pass_epa,
  SUM(l.share * pr.pressures) AS on_pressures,
  -- Dropbacks in games PFR charted, the denominator for the pressure rate.
  SUM(l.share * tp.dropbacks) FILTER (WHERE pr.pressures IS NOT NULL) AS on_pressure_dropbacks,
  SUM(l.share * tr.rushes) AS on_rushes,
  SUM(l.share * tr.rush_epa) AS on_rush_epa,
  SUM(l.share * tr.rush_success) AS on_rush_success,
  SUM(l.share * tr.stuffed) AS on_stuffed,
  SUM(l.share * tc.ybc) AS on_ybc,
  SUM(l.share * tc.pfr_carries) AS on_pfr_carries
FROM linemen l
LEFT JOIN team_pass tp ON tp.game_id = l.game_id AND tp.team = l.team
LEFT JOIN team_rush tr ON tr.game_id = l.game_id AND tr.team = l.team
LEFT JOIN team_pressure pr ON pr.game_id = l.game_id AND pr.team = l.team
LEFT JOIN team_contact tc ON tc.game_id = l.game_id AND tc.team = l.team
LEFT JOIN penalties pe ON pe.game_id = l.game_id AND pe.player_id = l.player_id
GROUP BY l.player_id, l.season, l.week;

CREATE UNIQUE INDEX "player_week_ol_key" ON "player_week_ol" ("player_id", "season", "week");
CREATE INDEX "player_week_ol_season_week_idx" ON "player_week_ol" ("season", "week");
