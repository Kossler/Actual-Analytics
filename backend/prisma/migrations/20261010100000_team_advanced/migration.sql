-- Advanced team stats per game, for each side of the ball (side 'off' = the team's offense,
-- 'def' = what its defense allowed): explosive and stuffed plays, pass rate over expected, style
-- (shotgun, no-huddle, and FTN-charted motion, play-action and blitzes from 2022), turnover luck,
-- 4th downs, drives and special teams. Every column is a count or sum, so any range of games can
-- be added up and turned into rates.

-- Build without parallel workers: parallel hash joins need shared memory, which small Postgres
-- containers (Docker's 64 MB /dev/shm default) don't have.
SET max_parallel_workers_per_gather = 0;

CREATE MATERIALIZED VIEW "team_game_adv" AS
WITH plays AS (
  SELECT p.game_id, p.season::INT AS season, p.week::INT AS week, p.season_type, p.posteam, p.defteam,
         p.play_type, p.down, p.ydstogo, p.yards_gained, p.epa, p.wp, p.half_seconds_remaining, p.yardline_100,
         p.pass, p.rush, p.qb_dropback, p.qb_kneel, p.shotgun, p.no_huddle, p.xpass, p.special_teams_play,
         p.interception, p.fumble, p.fumble_lost, p.fourth_down_converted, p.first_down,
         p.fixed_drive, p.fixed_drive_result, p.drive_time_of_possession, p.posteam_score, p.posteam_score_post,
         COALESCE(p.two_point_attempt, 0) = 0 AND p.epa IS NOT NULL AND (p.pass = 1 OR p.rush = 1) AS scrimmage,
         f.nflverse_play_id IS NOT NULL AS charted, f.is_motion, f.is_play_action, f.n_blitzers, f.is_interception_worthy
  FROM pbp p
  LEFT JOIN ftn_charting f ON f.nflverse_game_id = p.game_id AND f.nflverse_play_id = p.play_id
  WHERE p.posteam IS NOT NULL AND p.defteam IS NOT NULL
),
-- Each play counted once for the offense and once for the defense.
sided AS (
  SELECT p.*, s.side, s.team
  FROM plays p
  CROSS JOIN LATERAL (VALUES ('off', p.posteam), ('def', p.defteam)) AS s(side, team)
),
scrimmage AS (
  SELECT game_id, team, side,
    MAX(season) AS season, MAX(week) AS week, MAX(season_type) AS season_type,
    COUNT(*)::INT AS plays,
    COUNT(*) FILTER (WHERE (pass = 1 AND yards_gained >= 20) OR (rush = 1 AND yards_gained >= 10))::INT AS explosive,
    COUNT(*) FILTER (WHERE rush = 1)::INT AS rushes,
    COUNT(*) FILTER (WHERE rush = 1 AND yards_gained <= 0)::INT AS stuffed,
    -- Neutral script: 1st-3rd down, win probability 20-80%, outside the last two minutes of a half.
    COUNT(*) FILTER (WHERE neutral AND xpass IS NOT NULL)::INT AS neutral_plays,
    COALESCE(SUM(pass) FILTER (WHERE neutral AND xpass IS NOT NULL), 0)::INT AS neutral_passes,
    COALESCE(SUM(xpass) FILTER (WHERE neutral AND xpass IS NOT NULL), 0)::FLOAT AS neutral_xpass,
    COUNT(*) FILTER (WHERE neutral AND down <= 2)::INT AS neutral_early,
    COALESCE(SUM(pass) FILTER (WHERE neutral AND down <= 2), 0)::INT AS neutral_early_passes,
    COALESCE(SUM(shotgun), 0)::INT AS shotgun,
    COALESCE(SUM(no_huddle), 0)::INT AS no_huddle,
    COUNT(*) FILTER (WHERE charted)::INT AS charted_plays,
    COUNT(*) FILTER (WHERE is_motion)::INT AS motion,
    COUNT(*) FILTER (WHERE charted AND qb_dropback = 1)::INT AS charted_dropbacks,
    COUNT(*) FILTER (WHERE is_play_action AND qb_dropback = 1)::INT AS play_action,
    COUNT(*) FILTER (WHERE n_blitzers > 0 AND qb_dropback = 1)::INT AS blitzes,
    COUNT(*) FILTER (WHERE is_interception_worthy)::INT AS int_worthy,
    COALESCE(SUM(interception), 0)::INT AS interceptions,
    COALESCE(SUM(fumble), 0)::INT AS fumbles,
    COALESCE(SUM(fumble_lost), 0)::INT AS fumbles_lost
  FROM (
    SELECT *, (down <= 3 AND wp BETWEEN 0.2 AND 0.8 AND half_seconds_remaining > 120) AS neutral
    FROM sided WHERE scrimmage
  ) s
  GROUP BY game_id, team, side
),
-- 4th downs (excluding kneels): went for it vs. punted or kicked, and conversions.
fourth AS (
  SELECT game_id, team, side,
    COUNT(*) FILTER (WHERE play_type IN ('pass', 'run', 'punt', 'field_goal'))::INT AS fourth_downs,
    COUNT(*) FILTER (WHERE play_type IN ('pass', 'run'))::INT AS fourth_go,
    COUNT(*) FILTER (WHERE play_type IN ('pass', 'run') AND fourth_down_converted = 1)::INT AS fourth_conv,
    -- Short yardage in the opponent's half: where going for it is usually right.
    COUNT(*) FILTER (WHERE play_type IN ('pass', 'run', 'punt', 'field_goal') AND ydstogo <= 2 AND yardline_100 <= 50)::INT AS fourth_short,
    COUNT(*) FILTER (WHERE play_type IN ('pass', 'run') AND ydstogo <= 2 AND yardline_100 <= 50)::INT AS fourth_short_go
  FROM sided
  WHERE down = 4 AND COALESCE(qb_kneel, 0) = 0
  GROUP BY game_id, team, side
),
special AS (
  -- Special teams EPA from the team's point of view (its own kicks and returns, minus the opponent's).
  SELECT game_id, team, side,
    SUM(CASE WHEN side = 'off' THEN epa ELSE -epa END) AS st_epa,
    COUNT(*)::INT AS st_plays
  FROM sided
  WHERE special_teams_play = 1 AND epa IS NOT NULL
  GROUP BY game_id, team, side
),
drives AS (
  SELECT game_id, posteam, fixed_drive,
    MAX(fixed_drive_result) AS result,
    COALESCE(SUM(first_down) FILTER (WHERE scrimmage), 0) AS first_downs,
    COUNT(*) FILTER (WHERE scrimmage) AS plays,
    COALESCE(MIN(yardline_100) FILTER (WHERE scrimmage) <= 20, FALSE) AS red_zone,
    GREATEST(COALESCE(MAX(posteam_score_post) - MIN(posteam_score), 0), 0) AS points,
    MAX(SPLIT_PART(drive_time_of_possession, ':', 1)::INT * 60 + SPLIT_PART(drive_time_of_possession, ':', 2)::INT) AS seconds
  FROM plays
  WHERE fixed_drive IS NOT NULL AND drive_time_of_possession ~ '^[0-9]+:[0-9]{2}$'
  GROUP BY game_id, posteam, fixed_drive
),
drive_totals AS (
  SELECT d.game_id, s.team, s.side,
    COUNT(*)::INT AS drives,
    SUM(d.points)::INT AS drive_points,
    COUNT(*) FILTER (WHERE d.result = 'Punt' AND d.first_downs = 0)::INT AS three_and_outs,
    COUNT(*) FILTER (WHERE d.red_zone)::INT AS red_zone_trips,
    COUNT(*) FILTER (WHERE d.red_zone AND d.result = 'Touchdown')::INT AS red_zone_tds,
    COUNT(*) FILTER (WHERE d.result IN ('Touchdown', 'Field goal'))::INT AS scoring_drives,
    COUNT(*) FILTER (WHERE d.result IN ('Turnover', 'Opp touchdown'))::INT AS turnover_drives,
    SUM(d.seconds)::INT AS drive_seconds,
    SUM(d.plays)::INT AS drive_plays
  FROM drives d
  JOIN (SELECT DISTINCT game_id, posteam, defteam FROM plays) g ON g.game_id = d.game_id AND g.posteam = d.posteam
  CROSS JOIN LATERAL (VALUES ('off', g.posteam), ('def', g.defteam)) AS s(side, team)
  GROUP BY d.game_id, s.team, s.side
)
SELECT sc.*,
  COALESCE(fo.fourth_downs, 0) AS fourth_downs, COALESCE(fo.fourth_go, 0) AS fourth_go,
  COALESCE(fo.fourth_conv, 0) AS fourth_conv, COALESCE(fo.fourth_short, 0) AS fourth_short,
  COALESCE(fo.fourth_short_go, 0) AS fourth_short_go,
  COALESCE(st.st_epa, 0) AS st_epa, COALESCE(st.st_plays, 0) AS st_plays,
  COALESCE(dt.drives, 0) AS drives, COALESCE(dt.drive_points, 0) AS drive_points,
  COALESCE(dt.three_and_outs, 0) AS three_and_outs, COALESCE(dt.red_zone_trips, 0) AS red_zone_trips,
  COALESCE(dt.red_zone_tds, 0) AS red_zone_tds, COALESCE(dt.scoring_drives, 0) AS scoring_drives,
  COALESCE(dt.turnover_drives, 0) AS turnover_drives, COALESCE(dt.drive_seconds, 0) AS drive_seconds,
  COALESCE(dt.drive_plays, 0) AS drive_plays
FROM scrimmage sc
LEFT JOIN fourth fo USING (game_id, team, side)
LEFT JOIN special st USING (game_id, team, side)
LEFT JOIN drive_totals dt USING (game_id, team, side);

CREATE UNIQUE INDEX "team_game_adv_key" ON "team_game_adv" ("game_id", "team", "side");
CREATE INDEX "team_game_adv_season_idx" ON "team_game_adv" ("season", "team");
