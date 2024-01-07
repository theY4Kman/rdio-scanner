# Changelog (they4kman fork)
Since I occasionally pull in upstream changes, the original changelog will remain unmolested. This changelog will contain only changes made in this fork, and will be versioned in the format `<upstream-version>-yak.<yak-version>`. For example, `6.6.3-yak.0.0.1` is fork version `0.0.1` of the `6.6.3` upstream version.

I will attempt to retain semantic versioning on the fork version.

## Unreleased
### Added
- Show prev/current/next units in main display
- Click prev/current/next unit metadata to seek within call
- Show calls in playback history immediately upon playing (so full unit list can be viewed)


## [6.6.3-yak.0.0.1] — 2024-01-03
### Added
- Click call in playback history to replay call
- Include talkgroup's full name as title tooltip on TG selection panel
- Record call durations, and show in main/search panels
- Add keyboard shortcuts
- Show call queue/playback list total duration while paused
- Show elapsed timer on pause button
- Expand playback history to 30 max calls, constrained by screen height
- Propagate changes to units config to main display
- Show visual indicator when replaying call from history, using the TG's/system's LED color
- Show summary of units involved in each call in playback history (no display for current call, yet)
- Allow unit labels to be configured directly on main display
- Ingest call frequencies/sources `pos` in floating-point precision (instead of integer)
- Change update interval of frequency (incl errors/spikes) and source (unit) data on main display from .5s to .1s
- Clear UID on main display when call ends
- Show total/current source count on main display
- Include unit labels on search page
- Enable unit label configuration on search page
- Add button to delete unit label
- (dev) Allow configuration of dev server API proxy URL with `API_URL` env var

### Removed
- Removed unclosable mobile app adverts

### Fixed
- Show all TGs in search panel TG filter if no other filters configured
- Use double quotes in migrations (instead of backticks) for Postgres compat
- Prevent unit label config form closing or switching units when underlying call changes

### Changed
- Improve search query perf by limiting datetime bounds queries
