# Game and projection models

`models.py` runs at the end of every ingest. This note records how the current model
(`epa-qb-v2`) was chosen and how well it does, so future changes can be compared fairly.

## Evaluation protocol

- Every feature for a game uses only games completed before it (ratings warm up from 1999).
- Settings were tuned on 2006-2017 (fit) and 2018-2021 (validation). The 2022-2025 seasons were
  scored once at the end with a model fit on 2006-2021.
- A season-by-season walk-forward check (fit on every earlier season, predict the next) covers
  2012-2025.
- The benchmark is the closing moneyline with the bookmaker's margin removed.

## Win probability

Logistic regression on home-minus-away differences in:

| Feature | What it captures |
| --- | --- |
| `hfa_recent` | Home-field advantage estimated from the last 512 non-neutral games (it has shrunk) |
| `mar_diff` | Scoring-margin rating (margins capped at 21) |
| `soff_diff`, `sdef_diff` | Offensive success rate and success rate allowed |
| `qb_change` | Listed starter's rating vs. the QB play the team has been getting |
| `inj_diff` | Snap share of non-QB players listed Out on the injury report |

Team ratings are opponent-adjusted, decay 0.95 per game, and carry 90% of last season's rating into
a prior worth 10 games. Quarterback ratings are EPA per dropback with a 200-dropback prior at -0.15.
EPA/play ratings and starter quality scored the same but overlap heavily with success rate and
`qb_change` (r = 0.90), which made their weights swing sign between refits, so they are left out.

The projected margin is the margin the win probability implies (`sigma * probit(p)`), so the
favourite and projected score always agree. Totals use a separate linear model with league
scoring level, team scoring and EPA ratings, both quarterbacks' ratings, wind, cold and roof.

### Results

| | Brier | Log loss | Picks |
| --- | --- | --- | --- |
| Previous model (`epa-ratings-v1`), 2022-2025 | 0.2229 | 0.6363 | 63.8% |
| Current model, 2022-2025 | 0.2196 | 0.6293 | 65.1% |
| Betting market, 2022-2025 | 0.2100 | 0.6070 | 67.6% |
| Current model, walk-forward 2012-2025 | 0.2152 | 0.6192 | 65.7% |
| Previous model, walk-forward 2012-2025 | 0.2197 | — | — |
| Betting market, 2012-2025 | 0.2109 | — | — |

The current model beats the previous one in 13 of 14 walk-forward seasons and closes about half
the gap to the market. Margin error on 2022-2025 fell from 9.96 to 9.84 points, total error from
10.57 to 10.45 (market: 9.54 and 10.19).

Tried and dropped (no validation gain, or worse): pass/rush EPA splits, neutral-script EPA, rest
days, time-zone travel, divisional games, a home-field time trend, recency-weighted training,
doubtful players in the injury feature, separate offense/defense injury terms. Using the betting
line as an input reaches market level (Brier 0.2105) but was left out so the model stays an
independent view.

## Player projections

Recency-weighted per-game averages (0.88 per game, last season weighted 0.3), adjusted for what the
opponent has allowed to the player's position group (shrunk with 4 league-average games, applied at
half strength). Backtested on 2023-2024 and scored on 2025: about 1% lower error than the previous
settings. Ranges are calibrated each run so 80% of last season's outcomes fell inside them.
The old adjustment from a defense's overall EPA allowed, and game-script adjustments from the
projected margin, did not help and are not used.
