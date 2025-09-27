using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddModelTexturePackRelationship : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TexturePacks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TexturePacks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ModelTexturePacks",
                columns: table => new
                {
                    ModelsId = table.Column<int>(type: "integer", nullable: false),
                    TexturePacksId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelTexturePacks", x => new { x.ModelsId, x.TexturePacksId });
                    table.ForeignKey(
                        name: "FK_ModelTexturePacks_Models_ModelsId",
                        column: x => x.ModelsId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ModelTexturePacks_TexturePacks_TexturePacksId",
                        column: x => x.TexturePacksId,
                        principalTable: "TexturePacks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Textures",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FileId = table.Column<int>(type: "integer", nullable: false),
                    TextureType = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TexturePackId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Textures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Textures_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Textures_TexturePacks_TexturePackId",
                        column: x => x.TexturePackId,
                        principalTable: "TexturePacks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ModelTexturePacks_TexturePacksId",
                table: "ModelTexturePacks",
                column: "TexturePacksId");

            migrationBuilder.CreateIndex(
                name: "IX_TexturePacks_Name",
                table: "TexturePacks",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_FileId_TextureType",
                table: "Textures",
                columns: new[] { "FileId", "TextureType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Textures_TexturePackId_TextureType",
                table: "Textures",
                columns: new[] { "TexturePackId", "TextureType" },
                unique: true,
                filter: "[TexturePackId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_TextureType",
                table: "Textures",
                column: "TextureType");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ModelTexturePacks");

            migrationBuilder.DropTable(
                name: "Textures");

            migrationBuilder.DropTable(
                name: "TexturePacks");
        }
    }
}
