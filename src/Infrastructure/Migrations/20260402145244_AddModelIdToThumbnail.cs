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
                WHERE t."ModelVersionId" = mv."Id"
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
