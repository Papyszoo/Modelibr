using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBlenderOperationJobs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ExtractionJobs_AssetType_AssetId_VersionId_ExtractorFamily",
                table: "ExtractionJobs");

            migrationBuilder.AddColumn<string>(
                name: "Operation",
                table: "ExtractionJobs",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ParametersJson",
                table: "ExtractionJobs",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResultJson",
                table: "ExtractionJobs",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ExtractionJobs_AssetType_AssetId_VersionId_ExtractorFamily_~",
                table: "ExtractionJobs",
                columns: new[] { "AssetType", "AssetId", "VersionId", "ExtractorFamily", "Operation" },
                unique: true,
                filter: "\"Status\" IN (0, 1)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ExtractionJobs_AssetType_AssetId_VersionId_ExtractorFamily_~",
                table: "ExtractionJobs");

            migrationBuilder.DropColumn(
                name: "Operation",
                table: "ExtractionJobs");

            migrationBuilder.DropColumn(
                name: "ParametersJson",
                table: "ExtractionJobs");

            migrationBuilder.DropColumn(
                name: "ResultJson",
                table: "ExtractionJobs");

            migrationBuilder.CreateIndex(
                name: "IX_ExtractionJobs_AssetType_AssetId_VersionId_ExtractorFamily",
                table: "ExtractionJobs",
                columns: new[] { "AssetType", "AssetId", "VersionId", "ExtractorFamily" },
                unique: true,
                filter: "\"Status\" IN (0, 1)");
        }
    }
}
