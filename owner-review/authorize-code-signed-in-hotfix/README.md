# Owner review: homepage Authorize Code card for signed-out visitors only (v1.2.15)

Two captures of the same review (`scripts/review-quiz-pdfs-staging.mjs`, Chromium and WebKit,
five temporary synthetic accounts deleted at the end: trial eligible, used trial, active trial,
subscriber, payment problem). Release record: `docs/releases/mathnexa-v1.2.15-release-record.md`.

| Folder | Target | Result |
| --- | --- | --- |
| `staging/` | STAGING branch preview `dpl_3Xfo94Q6e67zCp26ytLPuR8szHyj` (https://mathnexa-platform-staging-lwy83rc3a-bright-path-ed-tech.vercel.app), build `2532244` | **337 checks passed, 0 failed**, 0 console/page errors, 0 resource-route refusals, 0 5xx |
| `production/` | PRODUCTION `https://mathnexa.com` = `dpl_3DUHT7Lcfy1VvGWStF9JLGnnkyyN`, build `2532244` | **337 checks passed, 0 failed**, 0 console/page errors, 0 resource-route refusals, 0 5xx |

## The six requested screenshots (each folder has the same names)

| # | Requested | File |
| --- | --- | --- |
| 1 | 390 px signed out: form visible | `26a-home-signed-out-390.png` (whole page) and `21c-homepage-authorize-code-form-390.png` (the card) |
| 2 | 390 px signed in: card absent | `26b-home-signed-in-subscriber-390.png` (subscriber) and `26b2-home-signed-in-non-subscriber-390.png` (trial eligible) |
| 3 | 320 px signed in: no empty space | `26c-home-signed-in-320.png` |
| 4 | Desktop signed out: form visible | `26d2-home-signed-out-1366-full.png` (whole page; `26d-home-signed-out-1366.png` is the first screen, where the card starts at the fold) |
| 5 | Desktop signed in: card absent | `26e-home-signed-in-1366.png` (first screen) and `26e2-home-signed-in-1366-full.png` |
| 6 | Banner: six products, no Authorize Code link | `26f-banner-signed-in-1366.png` (signed in), `21-banner-anonymous-1366.png` and `21b-banner-anonymous-390.png` (signed out) |

Also: `26g-webkit-home-signed-in-390.png` (the iPhone engine, subscriber, no card). The other
files are the standing Quiz PDFs / banner / preview evidence of the same run (cards, details,
downloads, every preview, 200% text at 320 and 390 px, WebKit). The downloaded quiz PDF the review
writes next to them is not kept here: it is byte-identical to the owner's file in `content/quiz-pdfs`.

## What each run proves

- Signed out, at all nine widths (320, 375, 390, 430, 768, 820, 1180, 1366, 1920): the card is in
  the page with its heading, the masked Code field, Show code and Continue. At 390 px the field is
  masked by default, Show/Hide switches it, a typed value never reaches the URL or web storage.
- One wrong dummy code sent with Continue at 390 px. Production refused it with the existing generic
  message "Code not accepted. Invalid authorized code." and the page stayed on `/`, with nothing in
  the URL or web storage. The staging branch preview has no school-access configuration (the
  staging project sets `MATHNEXA_SCHOOL_ACCESS_*` for its Production environment only), so there
  the server answered "Authorized access is temporarily unavailable." and the run records that.
- Signed in, the homepage contains no card at all (no container, form part, heading, Show/Hide
  control or Continue button in the document): trial eligible, used trial, payment problem and
  active trial at 390 px; the subscriber at all nine widths; the WebKit subscriber at 390 px. The
  hero copy ends on its actions with 0 px of trailing space, on single-column layouts the next
  section starts at the hero's ordinary gap (+0 px), and nothing overflows sideways.
- Unchanged surroundings: banner (six products, no Authorize Code item) at every width and at 320 px
  with 200% text; all 8 Quiz PDF cards with Preview, Details and Download PDF; every preview drawn
  page by page in both engines; every quiz at 320 and 390 px with 200% text (32/32 at 0 px); exact
  download and inline bytes; access states; axe 0 serious or critical.
