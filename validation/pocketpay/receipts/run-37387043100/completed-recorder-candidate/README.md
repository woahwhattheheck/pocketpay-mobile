# Local completed-recorder collection proposal

This changes only finish_recording in the reviewed e69 controller. Expiration
of the optional collection deadline does not measure whether an owned60-second
recording process has already completed. The original37387043100 metadata
retains that error and no video; it does not prove the actual recorder overran.

Poll the owned process first. An already completed process is drained with a
bounded5-second local wait; only exit0 before the original global600-second
suite deadline permits the existing guest transfer. Active processes retain
the existing minimum of recording/suite bounds, and an expired active bound
terminates only the owned recorder. Global expiry permits no transfer or guest
cleanup; unsafe-stop guards and excluded partial media behavior are preserved.
The actual clip60 seconds and all other original methods are unchanged.

Nine source-derived pure checks pass with zero real ADB/guest calls, including
the original completed-process-loss differential, completed/active/nonzero/
unsafe/global-deadline and transfer-failure cases. No native video, loading
frame, product pass or original recorder completion is inferred. This local
proposal has not been integrated, published or dispatched; e69 and the current
run remain unchanged.
