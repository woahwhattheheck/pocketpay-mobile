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
