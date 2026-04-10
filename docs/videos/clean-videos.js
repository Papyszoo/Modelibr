import { clearDirContents, ensureVideoDirs, finalDir, rawDir, reportsDir, targetDir, testResultsDir } from "./video-paths.js";

ensureVideoDirs();
clearDirContents(rawDir);
clearDirContents(finalDir);
clearDirContents(reportsDir);
clearDirContents(targetDir);
clearDirContents(testResultsDir);

console.log("Cleared docs video outputs.");
