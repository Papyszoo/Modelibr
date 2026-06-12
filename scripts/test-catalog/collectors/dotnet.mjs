// List .NET (xUnit) tests without running them via `dotnet test --list-tests`.
// Theory cases share a method name with a "(params)" suffix — we group those and
// count cases. Uses --no-build by default (fast); pass build=true to force a build
// if the test assemblies aren't compiled yet.

import { execSync } from "node:child_process";
import path from "node:path";
import { REPO_ROOT, rel } from "../util.mjs";

const PROJECTS = [
    "tests/Domain.Tests/Domain.Tests.csproj",
    "tests/Application.Tests/Application.Tests.csproj",
    "tests/Infrastructure.Tests/Infrastructure.Tests.csproj",
    "tests/WebApi.Tests/WebApi.Tests.csproj",
];

function listProject(csprojRel, build) {
    const csproj = path.join(REPO_ROOT, csprojRel);
    const flags = build ? "" : "--no-build";
    let out;
    try {
        out = execSync(`dotnet test "${csproj}" --list-tests ${flags}`, {
            cwd: REPO_ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            maxBuffer: 32 * 1024 * 1024,
        });
    } catch (err) {
        // --no-build fails if not compiled; surface a hint instead of a long build.
        return {
            project: csprojRel,
            error: build
                ? "dotnet test --list-tests failed"
                : "not built — run the backend suite once, or rebuild",
            classes: [],
            methodCount: 0,
            caseCount: 0,
        };
    }

    // Group "Namespace.Class.Method(args)" -> class -> method -> case count.
    const byClass = new Map();
    let caseCount = 0;
    for (const line of out.split(/\r?\n/)) {
        // Test lines are indented and look like a FQN; skip the headers.
        if (!/^\s{2,}\S+\.\S+/.test(line)) continue;
        const full = line.trim();
        const paren = full.indexOf("(");
        const fqnNoArgs = paren === -1 ? full : full.slice(0, paren);
        const lastDot = fqnNoArgs.lastIndexOf(".");
        if (lastDot === -1) continue;
        const className = fqnNoArgs.slice(0, lastDot);
        const method = fqnNoArgs.slice(lastDot + 1);
        if (!byClass.has(className)) byClass.set(className, new Map());
        const methods = byClass.get(className);
        methods.set(method, (methods.get(method) || 0) + 1);
        caseCount++;
    }

    const classes = [...byClass.entries()]
        .map(([name, methods]) => ({
            name,
            integration: name.includes(".Integration."),
            methods: [...methods.entries()].map(([m, cases]) => ({ name: m, cases })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return {
        project: rel(csproj),
        classes,
        methodCount: classes.reduce((n, c) => n + c.methods.length, 0),
        caseCount,
    };
}

export function collectDotnet({ build = false } = {}) {
    const projects = PROJECTS.map((p) => listProject(p, build));
    return {
        projects,
        methodCount: projects.reduce((n, p) => n + p.methodCount, 0),
        caseCount: projects.reduce((n, p) => n + p.caseCount, 0),
    };
}
