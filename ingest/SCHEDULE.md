# When the data updates

Every table is loaded from a file on a nflverse GitHub release
(`github.com/nflverse/nflverse-data/releases`), except expected fantasy points, which come from
ffverse (`github.com/ffverse/ffopportunity/releases`), and Sleeper's depth charts. Each dataset is rebuilt on its own schedule,
listed below from the [nflverse data schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
and nflverse's workflow files (checked October 2026).

| Table(s) | Source file | Rebuilt | Notes |
|---|---|---|---|
| `schedules` | `schedules/games` | Every 5 minutes in season | Scores and results during games. |
| `pbp`, `player_stats` | `pbp/play_by_play_{season}`, `stats_player/stats_player_week_{season}` | Daily at 09:03 UTC in season, plus game days: Thu 05:33, Sun 22:03, Mon 00:07, Mon 05:33, Tue 05:33 UTC | Builds take a few hours to land (e.g. the 09:03 run published at 12:31). The NFL's stat corrections arrive Monday–Wednesday, so Thursday's file is the final version of a week. |
| `rosters_weekly` | `weekly_rosters/roster_weekly_{season}` | Daily around 06:00–07:00 UTC | |
| `injuries` | `injuries/injuries_{season}` | Daily around 06:00–07:00 UTC in season | Teams file reports Wednesday–Saturday. |
| `depth_charts_current` | `depth_charts/depth_charts_{season}` | Daily around 06:00–07:00 UTC, all year | Timestamped snapshots since 2025; we keep the newest. The site uses it for the offensive line, holder and returners. |
| `depth_charts_sleeper` | Sleeper's players file (`api.sleeper.app/v1/players/nfl`) | Updated through the day | Sleeper asks for one fetch a day, so it loads on the first run of each UTC day. Free for non-commercial use. The `depth_chart` view combines it with `depth_charts_current`. |
| `nextgen_stats`, `nextgen_rushing`, `nextgen_receiving` | `nextgen_stats/ngs_{passing,rushing,receiving}` | Nightly, 3–5 AM ET, in season | Depends on when NGS publishes. |
| `snap_counts` | `snap_counts/snap_counts_{season}` | Every 6 hours (00, 06, 12, 18 UTC) in season | Depends on when PFR publishes. |
| `pfr_advstats_{pass,rush,rec,def}` | `pfr_advstats/advstats_week_{type}_{season}` | Every 6 hours (00, 06, 12, 18 UTC) in season | Depends on when PFR publishes; unchanged files are not re-uploaded. |
| `ftn_charting` | `ftn_charting/ftn_charting_{season}` | Every 6 hours (00, 06, 12, 18 UTC) in season | Depends on when FTN publishes. |
| `players` | `players/players` | About daily | Not in nflverse's published schedule. |
| `contracts` | `contracts/historical_contracts` | About daily | From Over The Cap; not in nflverse's published schedule. |
| `teams` | `teams/teams_colors_logos` | Rarely | |
| `ff_opportunity` | ffverse `ffopportunity` release `latest-data/ep_weekly_{season}` | After nflverse's play-by-play (seen at 12:38 UTC, minutes after it) | Expected fantasy points; from ffverse, not nflverse. |

`participation` isn't loaded: nflverse publishes it only after each season, and the site doesn't use it.

## How the ingest follows these schedules

Publish times drift (nflverse's jobs queue on GitHub Actions, and several wait on PFR, Next Gen Stats
or FTN), so the ingest doesn't try to guess them. Instead `.github/workflows/daily-ingestion.yml`
checks often and loads only what changed:

1. Every 30 minutes in season (September–February) and every 3 hours in the offseason,
   `python sources.py check` sends a HEAD request for each table's source file. That returns the
   file's ETag without downloading it and doesn't count against GitHub's API rate limit.
2. It compares the ETags with `source_files`, which records the version of each file as of its
   last successful load. If nothing changed, the run ends there, after a few seconds.
3. Otherwise `populate_tables.py` runs with `CHANGED_ONLY=1` for just the changed tables. It
   reads the versions before downloading, loads the tables, refreshes the views and models,
   bumps `data_version` (so the API drops its cache), and then records the versions it loaded.
   A table that fails to load isn't recorded, so the next run retries it.

So new data reaches the site within about 30 minutes of nflverse publishing it, including the
Monday–Thursday stat corrections and the daily injury and depth-chart updates.

Manual runs (Actions → Data Ingestion → Run workflow) load the requested tables (blank = all of
them) whether or not they changed. Tick "all seasons" to load every season instead of only the
latest; with the tables left blank, that refills the whole database (it can take an hour or more).
Tick "changed only" to do what a scheduled run does. All-season loads aren't tracked in
`source_files`.
