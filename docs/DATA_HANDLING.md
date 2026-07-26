# Data Handling

## Data map

| Data                              | Purpose                        | Storage              | Sent off device |
| --------------------------------- | ------------------------------ | -------------------- | --------------- |
| Team names and colors             | Run the current match          | Browser localStorage | No              |
| Timer, target, sound, difficulty  | Restore teacher preferences    | Browser localStorage | No              |
| Safe interrupted-match checkpoint | Resume at the next round intro | Browser localStorage | No              |
| Best times, streaks, themes       | Local replay value             | Browser localStorage | No              |
| Tournament standings and winners  | Local classroom records        | Browser localStorage | No              |
| App shell and puzzle source       | Offline startup                | Service-worker cache | No              |

Malformed or out-of-range stored values are rejected or replaced with safe
defaults before reaching game state. No sensitive permissions are requested.

## School deployment guidance

- Use fictional or group team names, not student full names.
- Clear site data between unrelated classes if records should not be shared.
- Treat a browser profile as the boundary for local classroom records.
- Do not add analytics, advertising, or cloud sync without a new privacy review
  and explicit school configuration.

## Deletion

Clear storage and service-worker data for the site in the browser's site
settings. There is no server copy to delete in this release.
