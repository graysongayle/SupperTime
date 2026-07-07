# Non-Functional Requirements

## Maintainability

The system should remain understandable and operable by a solo founder or small team. Prefer explicit code and documented decisions over broad abstractions.

## Reliability

Email ingestion and reply threading should be idempotent. External message IDs and thread IDs should be preserved where available.

## Security

Internal routes require Clerk authentication. Customer-facing support submission routes must remain accountless but validate inputs and attachment limits.

## Cost

Use managed services that keep operational overhead low. Avoid infrastructure that requires routine manual administration during MVP.

## Data Ownership

Support data should be stored in the application database and exportable without Freshdesk.
