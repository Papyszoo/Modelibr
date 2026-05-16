using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CollapseThumbnailWidthHeightToSize : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ThumbnailHeight",
                table: "ApplicationSettings");

            migrationBuilder.RenameColumn(
                name: "ThumbnailWidth",
                table: "ApplicationSettings",
                newName: "ThumbnailSize");

            // The old ThumbnailWidth accepted any int in [64, 2048]; the new
            // ThumbnailSize is restricted to {64, 128, 256, 512, 1024, 2048}.
            // Snap any prior values that aren't in the new allow-list to 256
            // so the domain-level validator doesn't reject a subsequent save.
            migrationBuilder.Sql(
                "UPDATE \"ApplicationSettings\" SET \"ThumbnailSize\" = 256 " +
                "WHERE \"ThumbnailSize\" NOT IN (64, 128, 256, 512, 1024, 2048);");

            // Forward-compatible Settings key-value table: drop the obsolete
            // Width/Height keys and replace with a single Size key (defaulting
            // to 256 if neither legacy key was present).
            migrationBuilder.Sql(
                "INSERT INTO \"Settings\" (\"Key\", \"Value\", \"CreatedAt\", \"UpdatedAt\") " +
                "SELECT 'ThumbnailSize', " +
                "       COALESCE((SELECT \"Value\" FROM \"Settings\" WHERE \"Key\" = 'ThumbnailWidth'), '256'), " +
                "       NOW(), NOW() " +
                "WHERE NOT EXISTS (SELECT 1 FROM \"Settings\" WHERE \"Key\" = 'ThumbnailSize');");

            migrationBuilder.Sql(
                "UPDATE \"Settings\" SET \"Value\" = '256' " +
                "WHERE \"Key\" = 'ThumbnailSize' " +
                "  AND \"Value\" NOT IN ('64', '128', '256', '512', '1024', '2048');");

            migrationBuilder.Sql(
                "DELETE FROM \"Settings\" WHERE \"Key\" IN ('ThumbnailWidth', 'ThumbnailHeight');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ThumbnailSize",
                table: "ApplicationSettings",
                newName: "ThumbnailWidth");

            // ThumbnailHeight defaults to 256 (the original schema default) —
            // 0 would fail the legacy domain validator that required >= 64.
            migrationBuilder.AddColumn<int>(
                name: "ThumbnailHeight",
                table: "ApplicationSettings",
                type: "integer",
                nullable: false,
                defaultValue: 256);

            // Restore the Settings key-value rows that Up() removed so the
            // rolled-back state has the legacy keys present (rather than the
            // GetSettingsQueryHandler falling through to its hardcoded
            // fallbacks). Use ThumbnailSize as the source value for both since
            // it's the most accurate proxy after a Down rollback.
            migrationBuilder.Sql(
                "INSERT INTO \"Settings\" (\"Key\", \"Value\", \"CreatedAt\", \"UpdatedAt\") " +
                "SELECT 'ThumbnailWidth', " +
                "       COALESCE((SELECT \"Value\" FROM \"Settings\" WHERE \"Key\" = 'ThumbnailSize'), '256'), " +
                "       NOW(), NOW() " +
                "WHERE NOT EXISTS (SELECT 1 FROM \"Settings\" WHERE \"Key\" = 'ThumbnailWidth');");

            migrationBuilder.Sql(
                "INSERT INTO \"Settings\" (\"Key\", \"Value\", \"CreatedAt\", \"UpdatedAt\") " +
                "SELECT 'ThumbnailHeight', " +
                "       COALESCE((SELECT \"Value\" FROM \"Settings\" WHERE \"Key\" = 'ThumbnailSize'), '256'), " +
                "       NOW(), NOW() " +
                "WHERE NOT EXISTS (SELECT 1 FROM \"Settings\" WHERE \"Key\" = 'ThumbnailHeight');");

            migrationBuilder.Sql(
                "DELETE FROM \"Settings\" WHERE \"Key\" = 'ThumbnailSize';");
        }
    }
}
