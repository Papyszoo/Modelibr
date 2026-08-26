using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMaterials : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Materials",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CategoryId = table.Column<int>(type: "integer", nullable: true),
                    BaseColorR = table.Column<float>(type: "real", nullable: false),
                    BaseColorG = table.Column<float>(type: "real", nullable: false),
                    BaseColorB = table.Column<float>(type: "real", nullable: false),
                    BaseColorA = table.Column<float>(type: "real", nullable: false),
                    Roughness = table.Column<float>(type: "real", nullable: false),
                    Metallic = table.Column<float>(type: "real", nullable: false),
                    EmissiveR = table.Column<float>(type: "real", nullable: false),
                    EmissiveG = table.Column<float>(type: "real", nullable: false),
                    EmissiveB = table.Column<float>(type: "real", nullable: false),
                    NormalScale = table.Column<float>(type: "real", nullable: false),
                    OcclusionStrength = table.Column<float>(type: "real", nullable: false),
                    Ior = table.Column<float>(type: "real", nullable: false),
                    AlphaMode = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    AlphaCutoff = table.Column<float>(type: "real", nullable: false),
                    DoubleSided = table.Column<bool>(type: "boolean", nullable: false),
                    PreviewGeometryType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "sphere"),
                    ThumbnailPath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PngThumbnailPath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Materials", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Materials_TextureSetCategories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "TextureSetCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "MaterialTagAssignments",
                columns: table => new
                {
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    ModelTagId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaterialTagAssignments", x => new { x.MaterialId, x.ModelTagId });
                    table.ForeignKey(
                        name: "FK_MaterialTagAssignments_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MaterialTagAssignments_ModelTags_ModelTagId",
                        column: x => x.ModelTagId,
                        principalTable: "ModelTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Materials_CategoryId",
                table: "Materials",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Materials_IsDeleted",
                table: "Materials",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_Materials_Name",
                table: "Materials",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialTagAssignments_ModelTagId",
                table: "MaterialTagAssignments",
                column: "ModelTagId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MaterialTagAssignments");

            migrationBuilder.DropTable(
                name: "Materials");
        }
    }
}
