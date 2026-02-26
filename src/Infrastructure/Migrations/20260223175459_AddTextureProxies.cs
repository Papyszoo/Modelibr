using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTextureProxies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TextureProxySize",
                table: "ApplicationSettings",
                type: "integer",
                nullable: false,
                defaultValue: 512);

            migrationBuilder.CreateTable(
                name: "TextureProxies",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TextureId = table.Column<int>(type: "integer", nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: false),
                    Size = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TextureProxies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TextureProxies_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TextureProxies_Textures_TextureId",
                        column: x => x.TextureId,
                        principalTable: "Textures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TextureProxies_FileId",
                table: "TextureProxies",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_TextureProxies_TextureId",
                table: "TextureProxies",
                column: "TextureId");

            migrationBuilder.CreateIndex(
                name: "IX_TextureProxies_TextureId_Size",
                table: "TextureProxies",
                columns: new[] { "TextureId", "Size" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TextureProxies");

            migrationBuilder.DropColumn(
                name: "TextureProxySize",
                table: "ApplicationSettings");
        }
    }
}
