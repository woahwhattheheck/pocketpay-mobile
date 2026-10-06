Local Retry global-deadline successor
====================================

This narrow controller proposal succeeds frozen late-host packet `15abefc1…`;
that packet and original run 37387043100 evidence remain untouched. The product
head/tree and payment outcome logic, fixtures, observers, controlled transport
and timings are unchanged. There is no URI replay, product source edit, ref
update, native action or new native-success assertion.

The old helper checked its deadline only on host-helper ADB calls. A pure
differential against its exact frozen source shows ordinary uncovered Review
still accepted after expiry. The successor applies one original 600-second
clock before and after raw dump/ADB, before fresh target acceptance, and before begin-case and installs its bound ADB callback
in both actual primary and gap namespaces. Independent cases never extend it. Each raw ADB timeout is capped to the remaining clock while preserving shorter original timeouts; a timeout at global expiry is converted to the bound exception. The unchanged recorder spawn has an immediate pre-spawn deadline guard.

Primary's actual four-case loop records blocked/unattempted callbacks once the
clock expires. Expiry inside a callback marks the case failed, excludes further
media and blocks later callbacks. Gap uses the original `UnsafeEnvironment`
class from its namespace: the unchanged first callback may enter, but its
launch wrapper fails before the original launcher/guest command, excludes
failure capture, and the remaining two callbacks are blocked by the unchanged
immutable gap loop.

The 36 owner pure checks comprise the original 21 late-host/media/custody
checks and fifteen deadline checks. These load actual primary/gap AST definitions,
namespace-install assignments and dispatch loops, use explicitly mocked raw
boundaries, and require zero guest commands. The frozen old expired target
acceptance/new rejection is tested directly. Original `primary_snapshot`,
`retry_outcome`, strict gap parser ASTs and helper bytes stay exact relative to
15ab; original gap outcome UI and all fixture/observer/transport files remain
unchanged. Importing/running tests does not invoke ADB or subprocesses.

Owner check command:

    ARTIFACT_DIR=/tmp SOURCE_SHA=ddd56649099d1fc5763ef29af3bfba0363897bd6 python -B -m unittest discover -s pocketpay-retry-deadline-local-candidate -p 'test*.py' -v

Only the three runtime derivative files replace 15ab's runtime files. Shared
ordinary/intro/parser/overlay helpers and all five original review fixtures are
byte-identical. Mock capture bytes exist only inside temporary pure-test
directories, never as retained native evidence. Final combined publication
and native run remain the coordinator's responsibility after exact review.
