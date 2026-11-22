# Definition of done

A ticket (a GitHub issue labelled `ticket`) is **done** only after it passes three gates in order: the dev loop, the PO review and QA. Each review runs in its own subagent with fresh context, so the reviewer judges the ticket and the app, not the implementer's reasoning.

## 1. Dev loop

Implement the ticket test-first. Loop until it is **green**: `tsc --noEmit`, `vitest run` and `playwright test` all pass from a clean build.

## 2. PO review (subagent)

The subagent reads the ticket, `spec.md`, `GLOSSARY.md` and the ADRs the ticket cites, then judges **every acceptance criterion** as met or not met. Each judgement cites evidence: a test, a code path, or what the running app shows. It also flags anything built that the ticket didn't ask for, and any wording on screen that departs from the glossary.

## 3. QA (subagent)

The subagent starts the app and drives it as an Engineer, an Admin and the Operator, on a phone-sized screen, covering every acceptance criterion and the edge cases around it: empty and extreme input, another Engineer's Job Cards, going back, refreshing, and repeating a step. It reruns the full test suite and reports each defect with steps to reproduce it.

## Findings

Each review posts its verdict and findings as a comment on the ticket's issue, headed `PO review` or `QA`. Any finding sends the ticket back to the dev loop, and both reviews then run again on the fixed work. A finding the user decides not to fix is recorded in the ticket with the user's reason.

## Marking done

Once both reviews sign off with no open findings, tick the ticket's acceptance boxes, merge its pull request into `master`, and close the issue.
