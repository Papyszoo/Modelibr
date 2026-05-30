using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddKindToTextureSetCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TextureSetCategories_ParentId_Name",
                table: "TextureSetCategories");

            migrationBuilder.AddColumn<int>(
                name: "Kind",
                table: "TextureSetCategories",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_TextureSetCategories_Kind_ParentId_Name",
                table: "TextureSetCategories",
                columns: new[] { "Kind", "ParentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TextureSetCategories_ParentId",
                table: "TextureSetCategories",
                column: "ParentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TextureSetCategories_Kind_ParentId_Name",
                table: "TextureSetCategories");

            migrationBuilder.DropIndex(
                name: "IX_TextureSetCategories_ParentId",
                table: "TextureSetCategories");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "TextureSetCategories");

            migrationBuilder.CreateIndex(
                name: "IX_TextureSetCategories_ParentId_Name",
                table: "TextureSetCategories",
                columns: new[] { "ParentId", "Name" },
                unique: true);
        }
    }
}
