using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddModelIdToThumbnail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ModelId",
                table: "Thumbnails",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Backfill ModelId from ModelVersion for existing rows
            migrationBuilder.Sql(
                """
                UPDATE "Thumbnails" t
                SET "ModelId" = mv."ModelId"
                FROM "ModelVersions" mv
                -- Terminated, which matters only outside the app: EF runs each Sql() call
                -- as its own command, so an unterminated statement is invisible at runtime
                -- and merges into the next one when the migrations are rendered to a .sql
                -- script - which made `dotnet ef migrations script` unusable for this
                -- database entirely, in both plain and idempotent form.
                WHERE t."ModelVersionId" = mv."Id";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ModelId",
                table: "Thumbnails");
        }
    }
}
