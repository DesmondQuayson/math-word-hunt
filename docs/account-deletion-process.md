# Account deletion process

Phase 1D implements request-only deletion. An active teacher can create one pending request and view it. A database trigger marks the profile `deletion_requested`, immediately restricting protected writes. Duplicate pending requests are constrained.

Nothing is permanently deleted. Teachers cannot resolve requests, reverse account status, or erase Auth/data records. Resolution operations, retention periods, identity verification, export, support workflow, and permanent deletion require owner, privacy, and operational approval in a later phase.
