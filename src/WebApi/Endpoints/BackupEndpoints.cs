using Application.Abstractions.Services;

namespace WebApi.Endpoints;

public static class BackupEndpoints
{
    public static void MapBackupEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/backups", (IBackupService backupService) =>
        {
            return Results.Ok(new { backups = backupService.ListBackups() });
        })
        .WithName("List Backups")
        .WithTags("Backups");

        app.MapGet("/backups/storage", (IBackupService backupService) =>
        {
            return Results.Ok(backupService.GetStorageInfo());
        })
        .WithName("Get Backup Storage Info")
        .WithTags("Backups");

        app.MapGet("/backups/estimate", async (IBackupService backupService, CancellationToken ct) =>
        {
            var estimate = await backupService.EstimateSizeAsync(ct);
            return Results.Ok(estimate);
        })
        .WithName("Estimate Backup Size")
        .WithTags("Backups");

        app.MapPost("/backups", async (
            CreateBackupRequest? request,
            IBackupService backupService,
            CancellationToken ct) =>
        {
            try
            {
                var scope = new BackupScope(IncludeThumbnails: request?.IncludeThumbnails ?? false);
                var summary = await backupService.StartBackupAsync(scope, ct);
                return Results.Accepted($"/backups/{summary.FileName}", summary);
            }
            catch (InvalidOperationException ex)
            {
                return Results.Conflict(new { error = "BackupInProgress", message = ex.Message });
            }
        })
        .WithName("Create Backup")
        .WithTags("Backups");

        app.MapGet("/backups/{fileName}", (
            string fileName,
            IBackupService backupService) =>
        {
            var path = backupService.ResolveBackupPath(fileName);
            if (path == null)
            {
                return Results.NotFound(new { error = "BackupNotFound", message = $"Backup {fileName} not found." });
            }

            return Results.File(path, "application/x-tar", fileDownloadName: fileName);
        })
        .WithName("Download Backup")
        .WithTags("Backups");

        app.MapDelete("/backups/{fileName}", (
            string fileName,
            IBackupService backupService) =>
        {
            try
            {
                backupService.DeleteBackup(fileName);
                return Results.NoContent();
            }
            catch (FileNotFoundException)
            {
                return Results.NotFound(new { error = "BackupNotFound", message = $"Backup {fileName} not found." });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = "InvalidName", message = ex.Message });
            }
        })
        .WithName("Delete Backup")
        .WithTags("Backups");

        app.MapPost("/backups/{fileName}/restore", (
            string fileName,
            IBackupService backupService) =>
        {
            try
            {
                backupService.StageRestore(fileName);
                // 202 Accepted — the actual restore happens on the next webapi boot
                // via RestoreOnBootProcessor, not synchronously here.
                return Results.Accepted(value: new
                {
                    staged = true,
                    message = "Backup staged for restore. Restart the webapi container to apply.",
                });
            }
            catch (FileNotFoundException)
            {
                return Results.NotFound(new { error = "BackupNotFound", message = $"Backup {fileName} not found." });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = "InvalidName", message = ex.Message });
            }
        })
        .WithName("Stage Backup For Restore")
        .WithTags("Backups");
    }
}

public record CreateBackupRequest(bool IncludeThumbnails);
