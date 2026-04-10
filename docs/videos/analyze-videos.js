import { analyzeVideoDirectory, writeAnalysisReport } from "./video-analysis.js";
import { finalDir } from "./video-paths.js";

const results = await analyzeVideoDirectory(finalDir);
const reportPath = writeAnalysisReport("final-video-analysis.json", results);

let hasFailure = false;
for (const result of results) {
    if (!result.exists) {
        console.error(`Missing video artifact: ${result.outputName}`);
        hasFailure = true;
        continue;
    }

    if (result.issues.length > 0) {
        console.error(
            `${result.outputName}: ${result.issues.join(", ")} (duration ${result.duration}s, recommendedEnd ${result.recommendedEnd}s)`,
        );
        hasFailure = true;
        continue;
    }

    console.log(`${result.outputName}: OK (${result.duration}s)`);
}

console.log(`Final analysis report written to ${reportPath}`);

if (hasFailure) {
    process.exit(1);
}
