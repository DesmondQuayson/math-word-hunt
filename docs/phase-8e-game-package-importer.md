# Phase 8E game package importer

Phase 8E accepts owner-created MathNexa ZIP packages without executing uploaded code on the server. Packages enter a draft, move through validation and owner review, and publish only through bounded service-role functions. The canonical v7 game and its historical builds remain separate and unchanged.

## Package contract

`manifest.json` declares schema `1.0`, stable game ID, increasing semantic version, display metadata, exact Grade → Topic → Lesson identity, a `game/*.html` entry file, `thumbnail.png`, an exact asset inventory, SHA-256 hashes, and minimum runtime `1.0.0`. `metadata.json` and every declared asset must be present. ZIP64, encrypted or multi-disk archives, symlinks, traversal, case-folded duplicate names, unsupported compression, more than 256 entries, compressed data over 25 MB, expanded data over 75 MB, individual assets over 20 MB, and suspicious compression ratios fail closed.

Text assets reject package hooks, inline executable HTML, external URLs, forms and embedded frames, `eval`, `new Function`, WebAssembly, shared memory, service workers, beacon APIs, cookies, and browser storage. Rejected archives retain private quarantine evidence and are never previewed or published.

## Storage and execution

`game-packages` and `game-package-quarantine` are private Supabase Storage buckets. Browser roles cannot enumerate or mutate package records, assets, quarantine evidence, or launch evidence. The application server reads private objects through short-lived signed storage requests and proxies bytes without exposing those URLs.

Admin previews and subscriber launches use an iframe with only `allow-scripts`. The frame does not receive same-origin authority, top navigation, popups, forms, devices, clipboard, payment, or fullscreen. A five-minute, HMAC-signed, package- and principal-scoped capability is carried in the asset path so relative assets work without MathNexa cookies. Subscriber asset requests verify that capability and repeat the server-owned account and entitlement decision. Package assets permit opaque sandbox embedding through CORP but expose no CORS read authority. HTML receives a strict CSP limited to the signed package path with no external network, workers, child frames, objects, base URL, forms, or manifest. Direct top-level HTML requests return 404; the browser cannot grant access.

## Versioning and recovery

Game identity stays attached to one content resource. Imported source versions are immutable and must increase. Publishing follows `draft → validating → ready_for_review → published`; update history is additive. Rollback creates a new published resource/package record pointing to the selected immutable asset evidence. Archive hides the active version without deleting package history or stored evidence. Admin actions are written to the immutable audit ledger, and successful launches use a bounded service workflow.
