# Moviera Project Documentation

This directory separates current source-of-truth documents from historical implementation records. Developers and AI coding agents must use the current documents first and must inspect the latest repository code and migrations before making changes.

## Current Source of Truth

1. [`architecture-plan.md`](architecture-plan.md) — current architecture, implemented phase status, roadmap, security gates, and next actions.
2. [`security.md`](security.md) — implemented authorization model, current security status, and open pre-Phase-4 blockers.
3. [`environments.md`](environments.md) — local development, isolated database testing, CI, staging, production, migrations, and secrets.

If documentation conflicts with the current code or SQL migrations, stop and reconcile the difference. The latest verified `main` branch and complete forward-only migration history remain the implementation source of truth.

## Current Project Status

- Phases 0–3 are functionally complete.
- Phase 4 has not started.
- The next required engineering workstream is the Pre-Phase-4 Security Remediation Gate.
- Phase 4 may begin only after the blocking findings are fixed, regression-tested, merged into `main`, and re-audited.

## Implementation and Hardening Records

These documents preserve completed implementation history. They are not the authority for the current next step:

- [`phase1-cinema-onboarding-and-staff.md`](phase1-cinema-onboarding-and-staff.md)
- [`phase2-catalog-management.md`](phase2-catalog-management.md)
- [`phase3-customer-browsing.md`](phase3-customer-browsing.md)
- [`authorization-hardening.md`](authorization-hardening.md)

## Security Audits

- [`audits/pre-phase-4-security-audit.md`](audits/pre-phase-4-security-audit.md) — audited baseline, blocking findings, required remediation, and gate exit criteria.

## Required Workflow Before New Work

1. Fetch the latest GitHub state.
2. Switch to `main` and update with fast-forward only.
3. Confirm the worktree is clean and `main` matches `origin/main`.
4. Record the exact starting commit SHA.
5. Read the current architecture, security, and environment documents.
6. Read the documentation and migrations relevant to the requested workstream.
7. Create a dedicated branch from the verified `main`.
8. Keep documentation, security remediation, UI previews, and feature work in separate focused branches/PRs unless one change genuinely requires them together.
9. Update current documentation in the same PR whenever implementation status, architecture, security assumptions, environment behavior, or next steps change.

## Documentation Maintenance Rule

Keep the current documents at stable filenames. Do not create a new numbered architecture file for every small update. Git history preserves earlier versions. If a historical snapshot must be retained separately, place it under an archive location and label it clearly as superseded.
