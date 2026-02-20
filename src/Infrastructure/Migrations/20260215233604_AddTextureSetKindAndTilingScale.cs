using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTextureSetKindAndTilingScale : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Kind",
                table: "TextureSets",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<float>(
                name: "TilingScaleX",
                table: "TextureSets",
                type: "real",
                nullable: false,
                defaultValue: 1f);

            migrationBuilder.AddColumn<float>(
                name: "TilingScaleY",
                table: "TextureSets",
                type: "real",
                nullable: false,
                defaultValue: 1f);

            migrationBuilder.CreateIndex(
                name: "IX_TextureSets_Kind",
                table: "TextureSets",
                column: "Kind");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TextureSets_Kind",
                table: "TextureSets");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "TextureSets");

            migrationBuilder.DropColumn(
                name: "TilingScaleX",
                table: "TextureSets");

            migrationBuilder.DropColumn(
                name: "TilingScaleY",
                table: "TextureSets");
        }
    }
}
