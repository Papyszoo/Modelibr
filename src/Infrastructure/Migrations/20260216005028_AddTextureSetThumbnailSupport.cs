using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTextureSetThumbnailSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TextureSetId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PngThumbnailPath",
                table: "TextureSets",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ThumbnailPath",
                table: "TextureSets",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_TextureSetId",
                table: "ThumbnailJobs",
                column: "TextureSetId");

            migrationBuilder.AddForeignKey(
                name: "FK_ThumbnailJobs_TextureSets_TextureSetId",
                table: "ThumbnailJobs",
                column: "TextureSetId",
                principalTable: "TextureSets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ThumbnailJobs_TextureSets_TextureSetId",
                table: "ThumbnailJobs");

            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_TextureSetId",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "TextureSetId",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "PngThumbnailPath",
                table: "TextureSets");

            migrationBuilder.DropColumn(
                name: "ThumbnailPath",
                table: "TextureSets");
        }
    }
}
