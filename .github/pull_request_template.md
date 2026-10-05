## Summary

<!-- What changed, why it changed, and the user or contributor impact. -->

Closes #

## Test Plan and Evidence

<!--
Describe the happy path and at least one negative path. List automated and
manual checks with their results. For documentation-only changes, explain why
runtime tests are not applicable and list the static review performed.

Before requesting review, complete the
[PR Evidence Checklist](../docs/pr-evidence-checklist.md). Record only commands
and checks actually observed; never infer a pass from a prior commit.
-->

| Command or check | Result | Evidence or notes |
| --- | --- | --- |
| <!-- Command or check actually run --> | <!-- PASS / FAIL / NOT RUN / ACTION REQUIRED / UNKNOWN --> | <!-- Counts, link, output summary, or reason --> |

## Required PR Evidence

- [ ] **Issue reference:** Use `Closes #...` for complete scope or `Refs #...`
      for explicitly partial work.
- [ ] **Implementation summary:** The summary explains what changed, why, and
      any deliberate scope boundary.
- [ ] **Tests:** Added or updated tests and their results are listed, or an
      explicit `Not applicable — <reason>` justification is provided.
- [ ] **Commands run:** Every verification command or check actually run
      appears in the evidence table with its observed result.
- [ ] **CI status:** The latest commit's CI state is stated and linked when
      available; non-green or unknown states are not represented as passing.
- [ ] **Acceptance criteria:** Every issue criterion is represented in the
      Acceptance Criteria Audit below.

## Self-Assessment

Before opening this PR, run through the
[Self-Review Checklist](https://github.com/Axionvera/pocketpay-mobile/blob/main/docs/self-review-checklist.md).
Then complete the
[Contributor Self-Assessment](https://github.com/Axionvera/pocketpay-mobile/blob/main/docs/contributor-self-assessment.md) before
requesting review. Include concise evidence below; use
`Not applicable — <reason>` instead of leaving a required area unexplained.

- [ ] **Scope:** The change matches the linked issue and contains no unrelated
      or unfinished work.
- [ ] **Tests:** Appropriate automated and manual evidence is included above,
      or a no-test justification is provided.
- [ ] **CI:** Relevant local checks pass and required CI checks pass on the
      latest commit.
- [ ] **Documentation:** Affected documentation, comments, examples,
      screenshots, and links are updated, or no update is needed.
- [ ] **Known limitations:** Limitations, assumptions, risks, skipped checks,
      and follow-up work are disclosed below.
- [ ] **Acceptance criteria:** Each issue criterion is mapped to implementation
      or verification evidence below.

### CI Status

<!-- List local command results and link the latest CI run when available. -->

### Documentation

<!-- List documentation changes or explain why none are needed. -->

### Known Limitations

<!-- Write "None known" only after checking for limitations. -->

### Acceptance Criteria Audit

<!-- Map your changes to the issue acceptance criteria. See the [Traceability Table Guide](../docs/traceability-table.md) and docs/contributor-self-assessment.md for guidance on handling incomplete criteria and filling each field. -->

| Acceptance Criterion | Implementation Evidence | Test Evidence | Documentation Impact | Status |
| --- | --- | --- | --- | --- |
| <!-- Criterion --> | <!-- File, screenshot, or explanation --> | <!-- Test file or manual check --> | <!-- Docs changed, or N/A --> | Complete / Partial / Not Applicable / Not Implemented |

## Screenshots or Recordings

<!-- Required for visible UI or flow changes. Otherwise explain why not applicable. Never include secrets or personal data. -->
