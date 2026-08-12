/**
 * Asset-processor liveness guard for long thumbnail waits.
 *
 * Thumbnail waits are the longest in the suite (240s DB polls, 180s SignalR
 * waits, a 36-minute @slow test timeout). When the worker container dies they
 * all burn that budget in full and then report the UI symptom - "thumbnail never
 * became visible" - which reads as a frontend bug. On 2026-08-10 that turned one
 * dead worker into 3 red scenarios and 80 wasted minutes.
 *
 * This does not relax any assertion: the wrapped work must still pass. It only
 * aborts early, with an accurate message, once the worker has provably stopped
 * answering /health.
 */

const WORKER_HEALTH_URL =
    process.env.E2E_WORKER_HEALTH_URL ?? "http://localhost:3003/health";

const PROBE_TIMEOUT_MS = 4000;
const PROBE_INTERVAL_MS = 5000;
// Four consecutive misses (~20s) rather than one: the worker is single-threaded
// and a Blender conversion or an orbit render under software WebGL can stall its
// event loop long enough to drop a probe. Still an order of magnitude faster
// than the timeouts this replaces.
const FAILURES_BEFORE_ABORT = 4;

export async function isWorkerHealthy(
    timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<boolean> {
    try {
        const response = await fetch(WORKER_HEALTH_URL, {
            signal: AbortSignal.timeout(timeoutMs),
        });
        return response.ok;
    } catch {
        return false;
    }
}

function workerDownError(label: string): Error {
    return new Error(
        `Asset-processor worker stopped answering ${WORKER_HEALTH_URL} ` +
            `(${FAILURES_BEFORE_ABORT} consecutive probes over ~${
                (FAILURES_BEFORE_ABORT * PROBE_INTERVAL_MS) / 1000
            }s) while waiting for: ${label}.\n` +
            "The worker container is down - this is NOT a frontend or thumbnail-pipeline assertion failure.\n" +
            "Diagnose with: docker inspect --format '{{.State.Status}} exit={{.State.ExitCode}} " +
            "oomKilled={{.State.OOMKilled}} restarts={{.RestartCount}}' asset-processor-e2e\n" +
            "Container logs for this failure are written to tests/e2e/container-logs/.",
    );
}

/**
 * Run a thumbnail-dependent wait, failing fast if the worker dies underneath it.
 *
 * @param label What is being waited for - quoted verbatim in the failure message.
 * @param work  The wait itself. Its own failure always wins over the watchdog.
 */
export async function runWithWorkerWatchdog<T>(
    label: string,
    work: () => Promise<T>,
): Promise<T> {
    let settled = false;
    let consecutiveFailures = 0;
    let timer: NodeJS.Timeout | undefined;

    const watchdog = new Promise<never>((_, reject) => {
        timer = setInterval(async () => {
            if (settled) {
                return;
            }

            if (await isWorkerHealthy()) {
                consecutiveFailures = 0;
                return;
            }

            consecutiveFailures += 1;
            console.warn(
                `[WorkerHealth] ${WORKER_HEALTH_URL} unreachable ` +
                    `(${consecutiveFailures}/${FAILURES_BEFORE_ABORT}) while waiting for: ${label}`,
            );

            if (consecutiveFailures >= FAILURES_BEFORE_ABORT && !settled) {
                reject(workerDownError(label));
            }
        }, PROBE_INTERVAL_MS);
        // Deliberately NOT unref'd: an unref'd interval lets Node exit while the
        // wrapped wait is still pending, so the watchdog would silently never
        // fire. The finally below always clears it, so it cannot outlive the wait.
    });

    try {
        return await Promise.race([work(), watchdog]);
    } finally {
        settled = true;
        if (timer) {
            clearInterval(timer);
        }
    }
}
