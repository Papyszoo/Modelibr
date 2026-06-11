// Dependency-free interactive multi-select. Numbered toggle prompt (no raw-mode
// arrow handling) so it works reliably across terminals. Suites are shown grouped
// by tier; the fast tier is pre-selected.

import readline from "node:readline";
import { c } from "./util.mjs";

/**
 * @param {Array} suites  ordered suite list (numbering matches this order)
 * @param {Set<string>} preselected  suite ids checked by default
 * @returns {Promise<Array|null>} chosen suites, or null if the user quit
 */
export async function pickSuites(suites, preselected) {
    const selected = new Set(preselected);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const ask = (q) => new Promise((res) => rl.question(q, res));

    for (;;) {
        render(suites, selected);
        const ans = (
            await ask(
                c.bold(
                    "\nToggle numbers (e.g. 1 3 5) · a=all · n=none · f=fast · t=<tier> · Enter=run · q=quit: ",
                ),
            )
        )
            .trim()
            .toLowerCase();

        if (ans === "") break;
        if (ans === "q") {
            rl.close();
            return null;
        }
        if (ans === "a") {
            suites.forEach((s) => selected.add(s.id));
            continue;
        }
        if (ans === "n") {
            selected.clear();
            continue;
        }
        if (ans === "f") {
            selected.clear();
            suites
                .filter((s) => s.tier === "fast")
                .forEach((s) => selected.add(s.id));
            continue;
        }
        if (ans.startsWith("t")) {
            const tier = ans.slice(1).trim();
            const match = suites.filter((s) => s.tier === tier);
            if (match.length) match.forEach((s) => selected.add(s.id));
            continue;
        }
        for (const tok of ans.split(/\s+/)) {
            const i = parseInt(tok, 10);
            if (Number.isInteger(i) && i >= 1 && i <= suites.length) {
                const id = suites[i - 1].id;
                if (selected.has(id)) selected.delete(id);
                else selected.add(id);
            }
        }
    }

    rl.close();
    return suites.filter((s) => selected.has(s.id));
}

function render(suites, selected) {
    console.clear();
    console.log(c.bold(c.cyan("\n  Modelibr — select test suites to run\n")));
    let lastTier = null;
    suites.forEach((s, idx) => {
        if (s.tier !== lastTier) {
            console.log(c.dim(`\n  ${s.tier.toUpperCase()}`));
            lastTier = s.tier;
        }
        const box = selected.has(s.id) ? c.green("[x]") : "[ ]";
        const n = String(idx + 1).padStart(2, " ");
        const docker = s.requiresDocker ? c.gray(" (docker)") : "";
        console.log(`  ${box} ${c.dim(n)}  ${s.name}${docker}`);
    });
    const count = suites.filter((s) => selected.has(s.id)).length;
    console.log(c.dim(`\n  ${count} selected`));
}
