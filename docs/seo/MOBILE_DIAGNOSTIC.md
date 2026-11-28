# Mobile diagnostic — current public page

On 2026-11-27, the public homework page passed an anonymous browser check at
375×812 and 1280×900: HTTP 200, visible H1, correct canonical, no horizontal
overflow and the same gated-library destination. The mobile screenshot was also
visually inspected. The proposed fraction example was confirmed **not yet live**.

A Lighthouse 13.6.0 mobile run completed at 15:45:08 UTC with simulated throttling:
performance **79**, accessibility **100**, SEO **100**; LCP 1.20 s, total blocking
time 879 ms, CLS 0 and speed index 2.73 s. Exact observations and limitations are
in [the sanitized evidence](evidence/2026-11-27-mobile.json).

This is one lab run on the existing page, not real-user Core Web Vitals, a trend,
ranking, complete accessibility certification or a result of the unreleased edit.
Total blocking time is the clearest diagnostic concern in this run. Investigate
actual long-task/script attribution in a later review before proposing a fix;
do not remove tracking or add a fourth initial website proposal to chase a score.

The first free PageSpeed API attempt returned 429. The first local Lighthouse
trace failed with NO_NAVSTART; one bounded retry succeeded with no warnings.
The separate local application preview returned 503 with backend credentials
disabled. That access/configuration boundary was preserved; the content diff
still needs mobile review on an authorized configured preview before release.

Reproduce from a machine with Node 22.19+ and Chrome installed, using a fresh
headless profile (no global install, no project dependency/lockfile changes):

```text
npx --yes --package=lighthouse@13.6.0 lighthouse https://mathnexa.com/homework-pdfs --chrome-flags="--headless=new" --form-factor=mobile --output=json --output-path=.seo-output/lighthouse-homework.json --only-categories=performance,accessibility,seo --quiet --max-wait-for-load=45000 --max-wait-for-fcp=20000
```

Set CHROME_PATH to the installed browser executable when needed. Retain full
traces locally, inspect runtime errors before reading scores, and publish only
sanitized public summaries. This is a manual diagnostic, not another scheduler.
See [official Lighthouse guidance](https://developer.chrome.com/docs/lighthouse/overview/)
for the distinction between automated audit findings and page-quality assessment.
