import { spawnSync } from "child_process";

function run(command, args, env = process.env) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        shell: false,
        env,
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

const args = process.argv.slice(2);
const slugsIndex = args.indexOf("--slugs");
let slugs = [];

if (slugsIndex >= 0) {
    slugs = args[slugsIndex + 1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    args.splice(slugsIndex, 2);
}

const extraEnv = { ...process.env };
if (slugs.length > 0) {
    extraEnv.DOCS_VIDEO_SLUGS = slugs.join(",");
}

run("node", ["clean-videos.js"]);
run("npx", ["playwright", "test", "--config=playwright.config.ts", ...args], extraEnv);
run("node", ["trim-videos.js"], extraEnv);
run("node", ["analyze-videos.js"], extraEnv);
run("node", ["collect-videos.js"], extraEnv);
