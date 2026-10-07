-- Offensive linemen: two refinements to the line's results while each lineman was on the field.
--
-- * Exact plays (2016-2025): nflverse's participation data lists who was on the field for every
--   play, so dropbacks, sacks and pressures can be counted over the plays a lineman actually played
--   instead of credited by snap share. It also gives the number of pass rushers, for a pressure rate
--   against four or fewer (no blitz). nflverse publishes it only after each season ends, so the
--   current season still relies on the snap-share credit. Pressure flags before 2023 skip sacks,
--   so a sack always counts as a pressure.
-- * Sacks the line allowed (2023 on): FTN charting marks sacks that were the quarterback's fault
--   (holding the ball, running into it). FTN doesn't list who was on the field, so these are
--   credited by snap share like the line's other results. FTN's 2022 charting marks 60% of sacks
--   as the quarterback's fault against about 35% from 2023, so 2022 is left out.
--
-- Public data still doesn't say which blocker allowed a pressure: these are the line's results on
-- the lineman's plays.

SET max_parallel_workers_per_gather = 0;

DROP MATERIALIZED VIEW IF EXISTS "player_week_ol";

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
-- FTN-charted dropbacks and sacks, and the sacks charted as the quarterback's fault (2023 on).
team_charted AS (
  SELECT p.game_id, p.posteam AS team,
         COUNT(*)::FLOAT AS dropbacks,
         COUNT(*) FILTER (WHERE p.sack = 1)::FLOAT AS sacks,
         COUNT(*) FILTER (WHERE p.sack = 1 AND f.is_qb_fault_sack)::FLOAT AS qb_fault_sacks
  FROM ftn_charting f
  JOIN pbp p ON p.game_id = f.nflverse_game_id AND p.play_id = f.nflverse_play_id
  WHERE f.season >= 2023 AND p.qb_dropback = 1 AND p.epa IS NOT NULL AND COALESCE(p.two_point_attempt, 0) = 0
  GROUP BY p.game_id, p.posteam
),
-- Every dropback with the players on the field (participation, 2016 on).
on_field AS (
  SELECT pa.nflverse_game_id AS game_id, UNNEST(STRING_TO_ARRAY(pa.offense_players, ';')) AS player_id,
         COALESCE(p.sack, 0) = 1 AS sack, pa.was_pressure, pa.number_of_pass_rushers AS rushers
  FROM participation pa
  JOIN pbp p ON p.game_id = pa.nflverse_game_id AND p.play_id = pa.play_id
  WHERE p.qb_dropback = 1 AND p.epa IS NOT NULL AND COALESCE(p.two_point_attempt, 0) = 0
    AND pa.offense_players IS NOT NULL AND pa.offense_players <> ''
),
exact AS (
  SELECT game_id, player_id,
         COUNT(*)::FLOAT AS dropbacks,
         COUNT(*) FILTER (WHERE sack)::FLOAT AS sacks,
         COUNT(*) FILTER (WHERE sack OR was_pressure IS NOT NULL)::FLOAT AS pressure_plays,
         COUNT(*) FILTER (WHERE sack OR was_pressure)::FLOAT AS pressures,
         COUNT(*) FILTER (WHERE (sack OR was_pressure IS NOT NULL) AND rushers <= 4)::FLOAT AS std_plays,
         COUNT(*) FILTER (WHERE (sack OR was_pressure) AND rushers <= 4)::FLOAT AS std_pressures
  FROM on_field
  GROUP BY game_id, player_id
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
  SUM(l.share * tc.pfr_carries) AS on_pfr_carries,
  -- FTN-charted dropbacks and sacks (2023 on), credited by snap share.
  SUM(l.share * ch.dropbacks) AS on_charted_dropbacks,
  SUM(l.share * ch.sacks) AS on_charted_sacks,
  SUM(l.share * ch.qb_fault_sacks) AS on_qb_fault_sacks,
  -- The plays he was on the field for (participation, 2016-2025).
  SUM(ex.dropbacks) AS ex_dropbacks,
  SUM(ex.sacks) AS ex_sacks,
  SUM(ex.pressure_plays) AS ex_pressure_plays,
  SUM(ex.pressures) AS ex_pressures,
  SUM(ex.std_plays) AS ex_std_plays,
  SUM(ex.std_pressures) AS ex_std_pressures
FROM linemen l
LEFT JOIN team_pass tp ON tp.game_id = l.game_id AND tp.team = l.team
LEFT JOIN team_rush tr ON tr.game_id = l.game_id AND tr.team = l.team
LEFT JOIN team_pressure pr ON pr.game_id = l.game_id AND pr.team = l.team
LEFT JOIN team_contact tc ON tc.game_id = l.game_id AND tc.team = l.team
LEFT JOIN team_charted ch ON ch.game_id = l.game_id AND ch.team = l.team
LEFT JOIN exact ex ON ex.game_id = l.game_id AND ex.player_id = l.player_id
LEFT JOIN penalties pe ON pe.game_id = l.game_id AND pe.player_id = l.player_id
GROUP BY l.player_id, l.season, l.week;

CREATE UNIQUE INDEX "player_week_ol_key" ON "player_week_ol" ("player_id", "season", "week");
CREATE INDEX "player_week_ol_season_week_idx" ON "player_week_ol" ("season", "week");
