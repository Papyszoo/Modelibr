using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPackEntity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Packs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Packs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PackModels",
                columns: table => new
                {
                    ModelsId = table.Column<int>(type: "integer", nullable: false),
                    PacksId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackModels", x => new { x.ModelsId, x.PacksId });
                    table.ForeignKey(
                        name: "FK_PackModels_Models_ModelsId",
                        column: x => x.ModelsId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PackModels_Packs_PacksId",
                        column: x => x.PacksId,
                        principalTable: "Packs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PackTextureSets",
                columns: table => new
                {
                    PacksId = table.Column<int>(type: "integer", nullable: false),
                    TextureSetsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackTextureSets", x => new { x.PacksId, x.TextureSetsId });
                    table.ForeignKey(
                        name: "FK_PackTextureSets_Packs_PacksId",
                        column: x => x.PacksId,
                        principalTable: "Packs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PackTextureSets_TextureSets_TextureSetsId",
                        column: x => x.TextureSetsId,
                        principalTable: "TextureSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PackModels_PacksId",
                table: "PackModels",
                column: "PacksId");

            migrationBuilder.CreateIndex(
                name: "IX_Packs_Name",
                table: "Packs",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_PackTextureSets_TextureSetsId",
                table: "PackTextureSets",
                column: "TextureSetsId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PackModels");

            migrationBuilder.DropTable(
                name: "PackTextureSets");

            migrationBuilder.DropTable(
                name: "Packs");
        }
    }
}
