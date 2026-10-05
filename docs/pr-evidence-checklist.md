# Pull Request Evidence Checklist

Use this checklist before requesting review. It defines the evidence that must be present in a PocketPay Mobile pull request description. It complements the [Self-Review Checklist](self-review-checklist.md), [Traceability Table Guide](traceability-table.md), and [Evaluation Readiness Checklist](evaluation-readiness-checklist.md); it does not replace required checks.

## Required Evidence

- [ ] **Issue reference:** Use `Closes #...` when the PR completes the linked issue, or `Refs #...` when the work is explicitly partial. Do not auto-close an issue for partial scope.
- [ ] **Implementation summary:** State what changed, why it changed, and any deliberate scope boundary or follow-up.
- [ ] **Tests:** List tests added or updated and their observed result. If tests do not apply, write `Not applicable — <reason>` and list the static validation that was performed.
- [ ] **Commands run:** Record each verification command or check actually executed and its observed result. Never report an unrun command as passing.
- [ ] **CI status:** Link the latest run or checks when available and state the observed status. `ACTION REQUIRED`, `FAIL`, `NOT RUN`, `UNKNOWN`, or an absent check is not green.
- [ ] **Acceptance criteria:** Copy every issue criterion into the PR's Acceptance Criteria Audit and map it to implementation, test, and documentation evidence. Mark incomplete work `Partial` or `Not Implemented` instead of hiding it.
- [ ] **Visual or device evidence:** For visible mobile changes, attach final screenshots or recordings and identify the device or emulator used. For non-visual work, explain why this evidence is not applicable.
- [ ] **Known limitations:** Disclose skipped checks, environment blockers, assumptions, and follow-up work.

## Command And Check Evidence

Use the table in the pull request template to record what was actually observed:

| Command or check | Result | Evidence or notes |
| --- | --- | --- |
| `npm test -- --runInBand <affected-test>` | PASS / FAIL / NOT RUN | Test count, relevant output, or reason not run |
| `npm run typecheck` | PASS / FAIL / NOT RUN | Relevant output or reason not run |
| Hosted CI | PASS / FAIL / ACTION REQUIRED / UNKNOWN | Link the latest run when available |

Keep the result tied to the exact source being reviewed. An older successful run is historical evidence, not proof that a newer commit is green.

## CI Evidence

Record the state of the latest commit. If hosted checks are approval-gated, absent, skipped, or failing for a known baseline reason, say that directly. Do not translate those states into a pass.

## Acceptance Criteria Traceability

The PR template's Acceptance Criteria Audit is the required mapping. For every criterion from the issue:

1. name the implementation evidence;
2. identify the test or manual evidence, or explain why it is not applicable;
3. state the documentation impact; and
4. mark the criterion `Complete`, `Partial`, `Not Applicable`, or `Not Implemented`.

See the [Traceability Table Guide](traceability-table.md) for examples.

## Documentation-Only Changes

Runtime tests are not required merely to create evidence for a documentation-only change. Instead, state that no runtime behavior changed and record the static checks that apply, such as:

- link and path review;
- template-field review;
- acceptance-criteria coverage review; and
- branch or diff readback.

Do not claim an application, device, test-suite, or CI result that was not executed.

## Related Guidance

- [Self-Review Checklist](self-review-checklist.md)
- [Contributor Self-Assessment](contributor-self-assessment.md)
- [Traceability Table Guide](traceability-table.md)
- [Evaluation Readiness Checklist](evaluation-readiness-checklist.md)
