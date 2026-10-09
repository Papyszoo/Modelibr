using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVfxThumbnails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ThumbnailPath",
                table: "Vfx",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VfxId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_VfxId",
                table: "ThumbnailJobs",
                column: "VfxId",
                unique: true,
                filter: "\"VfxId\" IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_ThumbnailJobs_Vfx_VfxId",
                table: "ThumbnailJobs",
                column: "VfxId",
                principalTable: "Vfx",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ThumbnailJobs_Vfx_VfxId",
                table: "ThumbnailJobs");

            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_VfxId",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "ThumbnailPath",
                table: "Vfx");

            migrationBuilder.DropColumn(
                name: "VfxId",
                table: "ThumbnailJobs");
        }
    }
}
