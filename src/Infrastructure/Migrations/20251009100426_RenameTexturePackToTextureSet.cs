using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RenameTexturePackToTextureSet : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Rename tables to preserve data
            migrationBuilder.RenameTable(
                name: "TexturePacks",
                newName: "TextureSets");

            migrationBuilder.RenameTable(
                name: "ModelTexturePacks",
                newName: "ModelTextureSets");

            // Rename column in Textures table
            migrationBuilder.RenameColumn(
                name: "TexturePackId",
                table: "Textures",
                newName: "TextureSetId");

            // Rename column in ModelTextureSets table
            migrationBuilder.RenameColumn(
                name: "TexturePacksId",
                table: "ModelTextureSets",
                newName: "TextureSetsId");

            // Rename indexes
            migrationBuilder.RenameIndex(
                name: "IX_TexturePacks_Name",
                table: "TextureSets",
                newName: "IX_TextureSets_Name");

            migrationBuilder.RenameIndex(
                name: "IX_Textures_TexturePackId_TextureType",
                table: "Textures",
                newName: "IX_Textures_TextureSetId_TextureType");

            migrationBuilder.RenameIndex(
                name: "IX_ModelTexturePacks_TexturePacksId",
                table: "ModelTextureSets",
                newName: "IX_ModelTextureSets_TextureSetsId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rename tables back
            migrationBuilder.RenameTable(
                name: "TextureSets",
                newName: "TexturePacks");

            migrationBuilder.RenameTable(
                name: "ModelTextureSets",
                newName: "ModelTexturePacks");

            // Rename column in Textures table back
            migrationBuilder.RenameColumn(
                name: "TextureSetId",
                table: "Textures",
                newName: "TexturePackId");

            // Rename column in ModelTexturePacks table back
            migrationBuilder.RenameColumn(
                name: "TextureSetsId",
                table: "ModelTexturePacks",
                newName: "TexturePacksId");

            // Rename indexes back
            migrationBuilder.RenameIndex(
                name: "IX_TextureSets_Name",
                table: "TexturePacks",
                newName: "IX_TexturePacks_Name");

            migrationBuilder.RenameIndex(
                name: "IX_Textures_TextureSetId_TextureType",
                table: "Textures",
                newName: "IX_Textures_TexturePackId_TextureType");

            migrationBuilder.RenameIndex(
                name: "IX_ModelTextureSets_TextureSetsId",
                table: "ModelTexturePacks",
                newName: "IX_ModelTexturePacks_TexturePacksId");
        }
    }
}
