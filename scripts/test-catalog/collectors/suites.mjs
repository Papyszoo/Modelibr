// Suite metadata straight from the runner manifest (the single source of truth),
// annotated with whether the suite's files exist on the current branch.

import { suites, tierOrder } from "../../test-runner/suites.config.mjs";
import { exists } from "../../test-runner/util.mjs";

export function collectSuites() {
    return {
        tierOrder,
        suites: suites.map((s) => ({
            id: s.id,
            name: s.name,
            kind: s.kind,
            cwd: s.cwd,
            command: s.command,
            tier: s.tier,
            requiresDocker: !!s.requiresDocker,
            present: exists(s.detectPath),
            reportPath: s.reportPath || null,
            note: s.note || null,
        })),
    };
}
