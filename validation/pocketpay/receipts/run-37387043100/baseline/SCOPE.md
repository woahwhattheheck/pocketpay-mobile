# Local proposal: one later baseline/vault Android guest pass

No device execution, workflow publication or dispatch has occurred for this
proposal. Pin source `52ce8006a2d091a4c9f29852a1a530750ff9b3cc`, product tree
`b7556026e93c5930915d12fdf51d421773c5f61e`, official Expo Go54.0.8 SHA256
`d72ed2cec15bf029c942d1cb70c933976ec83048e00d130bbfa6bad8cf22331a`.

Place this directory in an isolated validation controller at
`validation/pocketpay/baseline`. The proposed manual job uses Android34 x86_64
KVM, 2048M RAM, 2 cores, no physical phone and no secrets; timeout30 minutes.
Set SOURCE_SHA to the exact baseline pin, EXPO_PUBLIC_STELLAR_NETWORK=TESTNET,
EXPO_PUBLIC_VAULT_ENABLED=true, CI=1, EXPO_OFFLINE=1 and
EXPO_NO_TYPESCRIPT_SETUP=1. Prepare using prepare-baseline.sh; after actual
guest boot, run run-baseline.sh. Publication/dispatch remains with ledger/root.

The immutable source/fixture manifests are verified before setup. Only package
main and seven new validation files change the disposable app checkout.
Production screens/hooks/router remain unchanged. The core fixture controls
memory-only dummy state, read transports and blocked writes; details and
limitations are in baseline-fixture/README.md and vault-fixture/README.md.

Cases observe History missing→hydrated→missing without host remount, Create
masked dummy generation only, empty/invalid Import, real Sign summary/cancel/
Review navigation and return availability, picker search/selection/optional
edit rendering, actual nonsecret Diagnostics readiness, native redacted Share
sheet cancellation, and native Confirm Lock→Success/mock-lock receipt with
one production memory addLock and zero deposit/withdraw/secret/broadcast.
Sign return can remount through Slot; no same-instance focus-reset or repeated
tap exclusion is claimed. Picker edit/delete icons are not tapped by guessed
coordinates; actual with/without-edit PNGs require independent review.

Every retained screenshot first checks native XML for a revealed-secret label
or secret-key pattern. Unsafe XML/PNG are excluded, temporary guest dumps are
removed, and final native logs redact any secret-key pattern. Create never
touches Reveal, Copy or Continue. Import receives only invalid strings. Sign
stops before Sign & Send. Share cancellation runs even if evidence assertions
fail, and never selects a recipient or Copy action. No external diagnostics
message, signing, transaction, live vault/Horizon outcome, real wallet storage,
durable contacts or general all-app verification is established by this packet.

Actual failed cases and capture errors must be retained. A syntax/hash check is
preparation only. No readiness checkbox may be marked from this proposal.
Diagnostics transient loading requires actual frame observation; this initial
baseline proposal records only the safe Diagnostics case before launch, with
no hook delay; independent original-frame review must determine whether its
transient loading state was visible. It does not assert a loading screenshot.
Camera/retry gaps
have separate, exact feature-source followup packets and must remain separate
from all product/prerequisite/feature branches.


## Corrected local successor after run37379451997

The original baseline job did execute the prior controller and retained failure
media: all9 targets were unvisited because the dummy generator assignment could
not replace an actual getter-only Stellar export. The new fixture adds one
pre-load Metro seam before stores/router, preserving the real source52 files,
dummy seeds and all case/counter/transport assertions. Its installed-worker/
serializer ABI, fail-closed blockers and dummy generator were checked locally;
no native/full-bundle pass is claimed, and both failed local bundle logs remain
under the retained guard candidate receipt. Historical6-file/3-syntax setup
receipts are kept byte-exact; current setup installs7 files and checks4 syntax
inputs plus the separate vault route. Only the active baseline entry is repaired;
the vault standalone scaffold remains inactive and unvalidated.

The actual quoted Vault initialization line now decodes through a separate
strict literal baseline/vault prefix helper. Existing readiness/provenance/
transport/write and one-lock/amount outcome assertions are unchanged; zero
bootstrap counters cannot pass them. Known actual runtime-not-ready redbox
context fails before hidden target/action acceptance and only named failure
media may retain it. A fatal initializer marks remaining cases blocked/unattempted
without launching their callbacks. No baseline tutorial handling or warm replay
was added. Original failure artifacts remain intact.
