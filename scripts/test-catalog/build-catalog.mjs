#!/usr/bin/env node
// Assemble test-catalog/catalog.json from all collectors. Flags:
//   --no-github   skip the gh history fetch (offline / fast)
//   --build       force a dotnet build before --list-tests
//   --refresh-gh  ignore the GitHub-history cache
//   --quiet

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { CATALOG_DIR, CATALOG_FILE, REPO_ROOT, REPORT_DIR } from "./util.mjs";
import { collectSuites } from "./collectors/suites.mjs";
import { collectDotnet } from "./collectors/dotnet.mjs";
import { collectJest, collectVitest } from "./collectors/jsunit.mjs";
import { collectGherkin } from "./collectors/gherkin.mjs";
import { collectCi } from "./collectors/ci.mjs";
import { collectGithubHistory } from "./collectors/github-history.mjs";
import { collectLocalHistory } from "./collectors/local-history.mjs";
import { c as color } from "../test-runner/util.mjs";

function branch() {
    try {
        return execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: REPO_ROOT,
            stdio: ["ignore", "pipe", "ignore"],
        })
            .toString()
            .trim();
    } catch {
        return "unknown";
    }
}

export function buildCatalog({ github = true, build = false, refreshGh = false, quiet = false } = {}) {
    const log = (m) => !quiet && console.log(m);

    log(color.dim("• suites"));
    const suitesInfo = collectSuites();
    log(color.dim("• e2e features (gherkin)"));
    const e2e = collectGherkin();
    log(color.dim("• jest / vitest cases"));
    const jest = collectJest();
    const vitest = collectVitest();
    log(color.dim("• dotnet --list-tests"));
    const dotnet = collectDotnet({ build });
    log(color.dim("• ci workflows"));
    const ci = collectCi();
    log(color.dim("• local history"));
    const local = collectLocalHistory();
    let githubHist = { available: false, note: "skipped (--no-github)", jobs: {} };
    if (github) {
        log(color.dim("• github history (gh) — this can take a moment"));
        githubHist = collectGithubHistory({ force: refreshGh });
    }

    const wfByFile = Object.fromEntries(ci.workflows.map((w) => [w.file, w]));

    // Enrich each suite with CI bindings (triggers + GitHub timing) and local timing.
    const suites = suitesInfo.suites.map((s) => {
        const bindings = (ci.map[s.id] || []).map((b) => {
            const wf = b.workflow ? wfByFile[b.workflow] : null;
            const ghStats = b.workflow && b.jobName
                ? githubHist.jobs[`${b.workflow}::${b.jobName}`] || null
                : null;
            return {
                workflow: b.workflow,
                workflowName: wf ? wf.name : null,
                jobName: b.jobName,
                note: b.note || null,
                triggers: wf ? wf.triggers : null,
                github: ghStats,
            };
        });
        return { ...s, ci: bindings, local: local.bySuite[s.id] || null };
    });

    // Native installer pipeline (feat/tray-host) — the CODE isn't on every
    // branch, but the GitHub runs are branch-independent data, so surface them.
    const native = Object.entries(githubHist.jobs || {})
        .filter(([k]) => k.startsWith("native-release.yml::"))
        .map(([k, v]) => ({ job: k.split("::")[1], ...v }))
        .sort((a, b) => a.job.localeCompare(b.job));

    // Last local runner run (pass/fail per suite) — embedded so the read-only
    // snapshot has it too; the interactive UI fetches it live via /api/summary.
    let latestRun = null;
    try {
        const j = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, "summary.json"), "utf8"));
        latestRun = { meta: j.meta, results: j.results };
    } catch {
        /* no runner run yet */
    }

    const catalog = {
        generatedAt: new Date().toISOString(),
        repo: "Papyszoo/Modelibr",
        branch: branch(),
        tierOrder: suitesInfo.tierOrder,
        suites,
        native,
        latestRun,
        unit: { dotnet, jest, vitest },
        e2e,
        ci: { workflows: ci.workflows },
        history: {
            local: { runCount: local.runCount },
            github: { fetchedAt: githubHist.fetchedAt || null, available: githubHist.available, note: githubHist.note || null },
        },
        totals: {
            suites: suites.length,
            backendCases: dotnet.caseCount,
            jestCases: jest.caseCount,
            vitestCases: vitest.caseCount,
            e2eScenarios: e2e.scenarioCount,
            e2eFeatures: e2e.featureCount,
        },
    };

    fs.mkdirSync(CATALOG_DIR, { recursive: true });
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
    return catalog;
}

function main() {
    const argv = process.argv.slice(2);
    const opts = {
        github: !argv.includes("--no-github"),
        build: argv.includes("--build"),
        refreshGh: argv.includes("--refresh-gh"),
        quiet: argv.includes("--quiet"),
    };
    const t0 = Date.now();
    const cat = buildCatalog(opts);
    const t = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
        color.green(`\n✓ catalog.json written in ${t}s`) +
            color.dim(
                `\n  ${cat.totals.suites} suites · ${cat.totals.backendCases} backend · ` +
                    `${cat.totals.jestCases} jest · ${cat.totals.vitestCases} vitest · ` +
                    `${cat.totals.e2eScenarios} e2e scenarios (${cat.totals.e2eFeatures} features)` +
                    `\n  GitHub history: ${cat.history.github.available ? "ok" : cat.history.github.note}`,
            ),
    );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
