# Ethical Monetization Plan

## Free

- 15 puzzles: five Easy, five Medium, five Hard
- One-click Quick Play
- Two teams, fixed 30-second timer, first to three
- Core accessibility modes and all safety/fairness rules
- No ads, student accounts, tracking, artificial wait timers, or consumables

## Teacher Pro

- Complete 100-puzzle library
- Classroom Match controls: timer, target score, difficulty, names, colors
- Round-robin Tournament Mode for 2–8 teams
- Local best times, streaks, tournament history, and earned themes
- Installable offline PWA
- Future teacher puzzle builder when it meets the same validator gate

Entitlements live in `src/config/entitlements.ts`; gameplay correctness and
accessibility are never paywalled. The Free path is a durable product, not a
time-limited trial.

## Licensing principles

- License teachers or schools, never students.
- Avoid behavioral pricing, ads, loot boxes, streak-loss purchases, and
  classroom leaderboards that identify children.
- Offer purchase orders and a clear renewal reminder for schools.
- Keep exported teacher-created content portable if a builder ships later.
