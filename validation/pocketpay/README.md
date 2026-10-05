# Isolated manual Android evidence

This controller is outside the camera297 and retry321 feature branches. One
manual dispatch checks the two exact published source commits supplied by the
owner. It uses Android API34 x86_64, Expo Go54.0.8 and the actual app in Metro;
the emulator action and the official actions are pinned to verified Git commits.
The action may update Android tooling; actual versions and image metadata are
retained instead of claiming all SDK components were fixed by that action pin.

Camera: the validation route imports the final production Scan/Contacts screens.
It uses the actual permission hook, OS permission dialogs and CameraView with
emulated front/back hardware absent. No camera, hook, store or transport mock is
installed. Loading is transient and is reported only if actually observed.
Screenshots and XML are measured emulator output, never constructed UI images.

Retry: the launcher initializes dummy, memory-only Testnet wallet/store state
and replaces Horizon transport. Production review, transaction building,
signing, hashing, uncertain-result classification and recovery UI remain in use.
The transport has no HTTP submission path: submission waits then throws; lookup
returns controlled unknown/error/confirmed/failed observations. These are
explicitly controlled native UI results, never live-network/payment evidence.
Fixed dummy seeds are validation data, not user credentials; none are persisted,
logged, sent in routes or displayed. No secret or payment is requested.

An unmatched state or runtime failure leaves screenshots/XML/logs and exits
nonzero. A successful controller selection establishes only the UI cases it
actually captured. It does not establish a full app suite, iOS/device coverage,
barcode scanning on real hardware, network acceptance, deployment, rewards or
payment. No scheduler, push trigger, deployment or production credential exists.
