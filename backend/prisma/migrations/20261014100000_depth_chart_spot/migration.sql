-- Sleeper's injury status, and a spot column on the depth_chart view: the label for a row of the
-- chart (Sleeper's LWR / RWR / SWR where pos_abb says WR); injury_status is Sleeper's (IR, PUP...).
ALTER TABLE "depth_charts_sleeper" ADD COLUMN IF NOT EXISTS "injury_status" TEXT;

DROP VIEW IF EXISTS "depth_chart";
-- Sleeper's for every spot it orders; nflverse's (from ESPN) for the offensive line, holder and
-- returners, which Sleeper doesn't, and for any team missing from Sleeper's file. To change
-- provider, change this view.
CREATE VIEW "depth_chart" AS
SELECT 'Sleeper' AS source, dt, team, player_name, gsis_id, pos_grp, pos_abb, pos_name, pos_slot, pos_rank,
       CASE WHEN pos_abb = 'WR' THEN depth_chart_position ELSE pos_abb END AS spot, injury_status
FROM depth_charts_sleeper
UNION ALL
SELECT 'nflverse', dt, team, player_name, gsis_id,
       CASE WHEN pos_grp = 'Special Teams' THEN pos_grp WHEN pos_grp LIKE '% D' THEN 'Base D' ELSE 'Offense' END,
       pos_abb, pos_name, pos_slot::INT, pos_rank::INT, pos_abb, NULL
FROM depth_charts_current
WHERE pos_abb IN ('LT', 'LG', 'C', 'RG', 'RT', 'H', 'PR', 'KR')
   OR team NOT IN (SELECT team FROM depth_charts_sleeper);
