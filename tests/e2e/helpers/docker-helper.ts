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
}
