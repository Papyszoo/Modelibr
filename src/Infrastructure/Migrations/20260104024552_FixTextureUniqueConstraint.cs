using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixTextureUniqueConstraint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Textures_FileId_TextureType_SourceChannel",
                table: "Textures");

            migrationBuilder.DropIndex(
                name: "IX_Textures_TextureSetId_TextureType",
                table: "Textures");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_FileId",
                table: "Textures",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_TextureSetId_FileId_TextureType_SourceChannel",
                table: "Textures",
                columns: new[] { "TextureSetId", "FileId", "TextureType", "SourceChannel" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Textures_TextureSetId_TextureType",
                table: "Textures",
                columns: new[] { "TextureSetId", "TextureType" },
                filter: "\"TextureSetId\" IS NOT NULL AND \"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Textures_FileId",
                table: "Textures");

            migrationBuilder.DropIndex(
                name: "IX_Textures_TextureSetId_FileId_TextureType_SourceChannel",
                table: "Textures");

            migrationBuilder.DropIndex(
                name: "IX_Textures_TextureSetId_TextureType",
                table: "Textures");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_FileId_TextureType_SourceChannel",
                table: "Textures",
                columns: new[] { "FileId", "TextureType", "SourceChannel" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Textures_TextureSetId_TextureType",
                table: "Textures",
                columns: new[] { "TextureSetId", "TextureType" },
                unique: true,
                filter: "\"TextureSetId\" IS NOT NULL");
        }
    }
}
