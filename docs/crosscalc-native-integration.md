# CrossCalc native integration

CrossCalc is registered as one trusted same-origin MathNexa game at `/games/crosscalc/play`. Addition, Subtraction, Multiplication, Division, and Mixed Operations remain state inside one source-owned runtime. Player authorization, Admin Draft Preview, publication transition, maintenance behavior, and catalog projection use the same internal-game mechanism as Number Logic.

## Provenance

- Standalone source branch: `feature/crosscalc-v1`
- Approved standalone source commit: `3a54b61`
- CSS SHA-256: `2bb39ccb0b2cfa958b81e38037d8b33880a6207c22d0cda161e1a0b52baf5393`
- JS SHA-256: `4586cab64b3842c36df6c07b41a1885d997c3548cc8706b05a5f0da2a5310db5`
- Oldskool SHA-256: `888052a10a8939c8fa543b5e383e9852e2682e123aa077097c83de9976337a88`

## Boundaries

The renderer adds only a same-origin base and a 44px Back to Games link. CrossCalc owns generation, validation, Settings, fullscreen, audio, local progress, Reasoning Index, achievements, mode navigation, and responsive behavior. Its storage namespace is `mathnexa.crosscalc.v1` and does not overlap Number Cross or Number Logic.

The CSP denies third-party origins. The catalog migration adds exactly one `internal` row and forcibly leaves it `draft`; only an explicit owner publication action can make it public.

## Visual decision

The final accent system is turquoise blue and pink: `#20CFE3` for primary gameplay energy and horizontal paths, `#FF4F9A` for vertical paths, combos, and achievements, over `#071525` navy. The earlier green/gold direction is superseded.
