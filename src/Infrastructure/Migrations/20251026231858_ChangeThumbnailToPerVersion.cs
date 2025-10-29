using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ChangeThumbnailToPerVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_ModelHash",
                table: "ThumbnailJobs");

            migrationBuilder.AddColumn<int>(
                name: "ModelVersionId",
                table: "Thumbnails",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ModelVersionId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_Thumbnails_ModelVersionId",
                table: "Thumbnails",
                column: "ModelVersionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_ModelVersionId",
                table: "ThumbnailJobs",
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
            migrationBuilder.DropForeignKey(
                name: "FK_Thumbnails_ModelVersions_ModelVersionId",
                table: "Thumbnails");

            migrationBuilder.DropIndex(
                name: "IX_Thumbnails_ModelVersionId",
                table: "Thumbnails");

            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_ModelVersionId",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "ModelVersionId",
                table: "Thumbnails");

            migrationBuilder.DropColumn(
                name: "ModelVersionId",
                table: "ThumbnailJobs");

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_ModelHash",
                table: "ThumbnailJobs",
                column: "ModelHash",
                unique: true);
        }
    }
}
