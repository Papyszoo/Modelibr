using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateThumbnailJobsUniqueIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop the old unique index on ModelHash alone
            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_ModelHash",
                table: "ThumbnailJobs");

            // Create new composite unique index on ModelHash + ModelVersionId
            // This allows different versions to have separate thumbnail jobs even when sharing the same model file
            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_ModelHash_ModelVersionId",
                table: "ThumbnailJobs",
                columns: new[] { "ModelHash", "ModelVersionId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop the composite unique index
            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_ModelHash_ModelVersionId",
                table: "ThumbnailJobs");

            // Recreate the old unique index on ModelHash alone
            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_ModelHash",
                table: "ThumbnailJobs",
                column: "ModelHash",
                unique: true);
        }
    }
}
