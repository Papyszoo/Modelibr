using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddThumbnailIdToModelVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop the existing foreign key constraint from Thumbnail to ModelVersion
            migrationBuilder.DropForeignKey(
                name: "FK_Thumbnails_ModelVersions_ModelVersionId",
                table: "Thumbnails");

            // Drop the existing index on Thumbnails.ModelVersionId
            migrationBuilder.DropIndex(
                name: "IX_Thumbnails_ModelVersionId",
                table: "Thumbnails");

            // Add ThumbnailId column to ModelVersions table
            migrationBuilder.AddColumn<int>(
                name: "ThumbnailId",
                table: "ModelVersions",
                type: "integer",
                nullable: true);

            // Populate ThumbnailId from existing Thumbnail records
            migrationBuilder.Sql(@"
                UPDATE ""ModelVersions"" mv
                SET ""ThumbnailId"" = t.""Id""
                FROM ""Thumbnails"" t
                WHERE t.""ModelVersionId"" = mv.""Id""
            ");

            // Create unique index on ModelVersions.ThumbnailId
            migrationBuilder.CreateIndex(
                name: "IX_ModelVersions_ThumbnailId",
                table: "ModelVersions",
                column: "ThumbnailId",
                unique: true);

            // Add foreign key constraint from ModelVersions to Thumbnails
            migrationBuilder.AddForeignKey(
                name: "FK_ModelVersions_Thumbnails_ThumbnailId",
                table: "ModelVersions",
                column: "ThumbnailId",
                principalTable: "Thumbnails",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // Re-create the foreign key from Thumbnail to ModelVersion (for navigation only)
            migrationBuilder.CreateIndex(
                name: "IX_Thumbnails_ModelVersionId",
                table: "Thumbnails",
                column: "ModelVersionId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Thumbnails_ModelVersions_ModelVersionId",
                table: "Thumbnails",
                column: "ModelVersionId",
                principalTable: "ModelVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop the foreign key from ModelVersions to Thumbnails
            migrationBuilder.DropForeignKey(
                name: "FK_ModelVersions_Thumbnails_ThumbnailId",
                table: "ModelVersions");

            // Drop the index on ModelVersions.ThumbnailId
            migrationBuilder.DropIndex(
                name: "IX_ModelVersions_ThumbnailId",
                table: "ModelVersions");

            // Drop the ThumbnailId column from ModelVersions
            migrationBuilder.DropColumn(
                name: "ThumbnailId",
                table: "ModelVersions");

            // Drop the existing foreign key from Thumbnail to ModelVersion
            migrationBuilder.DropForeignKey(
                name: "FK_Thumbnails_ModelVersions_ModelVersionId",
                table: "Thumbnails");

            // Drop the index
            migrationBuilder.DropIndex(
                name: "IX_Thumbnails_ModelVersionId",
                table: "Thumbnails");

            // Re-create the original relationship (FK on Thumbnail side with Cascade delete)
            migrationBuilder.CreateIndex(
                name: "IX_Thumbnails_ModelVersionId",
                table: "Thumbnails",
                column: "ModelVersionId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Thumbnails_ModelVersions_ModelVersionId",
                table: "Thumbnails",
                column: "ModelVersionId",
                principalTable: "ModelVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
