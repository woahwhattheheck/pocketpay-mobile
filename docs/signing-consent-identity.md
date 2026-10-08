# Native XLM signing confirmation — route identity (#388)

The confirmation screen is a read-only preview of a pending XLM payment. The
Send screen forwards route arguments, which can be tampered with by deep links
or become stale after a wallet/network change. They must not independently
authorize a signer or define what network is used.

At render and again on the confirmation press, `validateSigningConsent` checks
that the supplied sender is the *currently active wallet*, the route network
matches the app's configured network, the asset is exactly native XLM, and the
recipient/amount/memo pass the same validators used by Send. Invalid fields,
repeated route parameter arrays, missing balance or changes to the wallet
block navigation with a safe explanation.

The arbitrary `fee` route parameter is deliberately ignored. The screen says
“Calculated at final review” instead of displaying the previous hard-coded
`100` stroops as an assurance. The next review screen queries Horizon for a
fresh fee and requires a separate explicit press for signing/submission.
No XDR, key material, or sender credential is placed into route params.

**Boundary:** this guards the consent/navigation step; it is not a
transaction-signature binding. The downstream `review-transaction` screen still
uses the active wallet and must separately validate its own current network,
fee, destination, and transaction immediately before signing. This change
intentionally leaves that independently owned source path untouched.

Focused regression: `__tests__/signingConsent.test.ts` covers active wallet
identity, route spoofing, native-only/network restrictions, amount/reserve and
memo validation, repeated params, unavailable balance and fee non-disclosure.
No live-network, hardware signer or device test is asserted by this patch.
