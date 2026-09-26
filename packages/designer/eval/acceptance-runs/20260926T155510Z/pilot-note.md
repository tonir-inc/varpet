# Excluded runner pilot

Measured 2026-09-26 UTC. Source 484b37f; this pilot is not the baseline.
The real editor imported b21-t13 successfully and split walls at junctions. The first
runner compared its export to the raw input, producing a false driver failure on
all three Komitas opens. `normalizeWallJunctions(source)` was then verified equal
to the saved browser export. No fixture or product code was changed.
The pilot was stopped during Avani's first repeat; its completed HTTP/model calls
and screenshots remain here. It is excluded because the driver could not execute
the planned cohort, not because its customer results were poor. The corrected
baseline is the separate 20260926T155711Z run.
Only this lane's private process groups were stopped (53220/53221). Reserved
ports were untouched. Later runner versions stop the batch on any driver failure.
