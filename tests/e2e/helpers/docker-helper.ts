import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class DockerHelper {
    /**
     * Get logs from a docker container
     * @param containerName Name of the container
     * @param lines Number of lines to retrieve (default: 200)
     * @returns The logs as a string
     */
    async getContainerLogs(containerName: string, lines: number = 200): Promise<string> {
        try {
            // Check if container exists/is running first (optional, but good for stability)
            // For now, just try getting logs. If it fails (e.g. container doesn't exist), capture error.
            const { stdout, stderr } = await execAsync(
                `docker logs --tail ${lines} ${containerName}`
            );
            
            if (stderr && !stdout) {
                // sometimes docker logs outputs to stderr even for info, but if only stderr and it looks like an error...
                // actually docker logs mixes stdout/stderr.
                // If the command failed, execAsync would throw.
                // So here we likely just have logs.
                return stderr + stdout;
            }
            return stdout + stderr; // Return both streams
        } catch (error: any) {
            console.warn(`[DockerHelper] Failed to get logs for ${containerName}: ${error.message}`);
            return `Failed to retrieve logs for ${containerName}. Container might not be running.\nError: ${error.message}`;
        }
    }

    /**
     * List filenames directly inside a directory in a running container.
     *
     * The e2e stack (docker-compose.e2e.yml) keeps uploads on a NAMED docker
     * volume, not a host bind mount (unlike tests/backup-restore-e2e, which
     * bind-mounts ./data/uploads and can just use fs.readdirSync). `docker exec`
     * is the only way to reach files under that volume from the test process —
     * this mirrors how `getContainerLogs` above already shells out to `docker`
     * for container introspection, just for files instead of logs. Returns []
     * if the directory doesn't exist yet (e.g. no orphan has ever been
     * quarantined) rather than throwing.
     */
    async listContainerDir(containerName: string, dirPath: string): Promise<string[]> {
        try {
            const { stdout } = await execAsync(
                `docker exec ${containerName} sh -c "ls -1 '${dirPath}' 2>/dev/null || true"`
            );
            return stdout
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
        } catch (error: any) {
            console.warn(`[DockerHelper] Failed to list ${dirPath} in ${containerName}: ${error.message}`);
            return [];
        }
    }

    /**
     * Read a text file from inside a running container (e.g. a quarantine JSON sidecar).
     */
    async readContainerTextFile(containerName: string, filePath: string): Promise<string> {
        const { stdout } = await execAsync(`docker exec ${containerName} cat '${filePath}'`);
        return stdout;
    }

    /**
     * Check whether a file exists inside a running container.
     */
    async containerFileExists(containerName: string, filePath: string): Promise<boolean> {
        try {
            await execAsync(`docker exec ${containerName} test -f '${filePath}'`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Remove a single file from inside a running container. Used to clean up
     * only the specific files a scenario created (e.g. one orphan + its sidecar) —
     * never a wholesale directory wipe, since parallel/other scenarios' orphan
     * files may coexist in the same directory.
     */
    async removeContainerFile(containerName: string, filePath: string): Promise<void> {
        try {
            await execAsync(`docker exec ${containerName} rm -f '${filePath}'`);
        } catch (error: any) {
            console.warn(`[DockerHelper] Failed to remove ${filePath} in ${containerName}: ${error.message}`);
        }
    }
}
