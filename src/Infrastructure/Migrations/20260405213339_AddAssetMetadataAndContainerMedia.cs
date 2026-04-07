using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAssetMetadataAndContainerMedia : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CustomThumbnailFileId",
                table: "Projects",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "Projects",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CustomThumbnailFileId",
                table: "Packs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LicenseType",
                table: "Packs",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Url",
                table: "Packs",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaterialCount",
                table: "ModelVersions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MeshCount",
                table: "ModelVersions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TechnicalDetailsUpdatedAt",
                table: "ModelVersions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TriangleCount",
                table: "ModelVersions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VertexCount",
                table: "ModelVersions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ModelCategoryId",
                table: "Models",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ModelCategories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ParentId = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelCategories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ModelCategories_ModelCategories_ParentId",
                        column: x => x.ParentId,
                        principalTable: "ModelCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ModelConceptImages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ModelId = table.Column<int>(type: "integer", nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelConceptImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ModelConceptImages_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ModelConceptImages_Models_ModelId",
                        column: x => x.ModelId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectConceptImages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectConceptImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectConceptImages_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectConceptImages_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Projects_CustomThumbnailFileId",
                table: "Projects",
                column: "CustomThumbnailFileId");

            migrationBuilder.CreateIndex(
                name: "IX_Packs_CustomThumbnailFileId",
                table: "Packs",
                column: "CustomThumbnailFileId");

            migrationBuilder.CreateIndex(
                name: "IX_Packs_LicenseType",
                table: "Packs",
                column: "LicenseType");

            migrationBuilder.CreateIndex(
                name: "IX_Models_ModelCategoryId",
                table: "Models",
                column: "ModelCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_ModelCategories_ParentId_Name",
                table: "ModelCategories",
                columns: new[] { "ParentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ModelConceptImages_FileId",
                table: "ModelConceptImages",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_ModelConceptImages_ModelId_FileId",
                table: "ModelConceptImages",
                columns: new[] { "ModelId", "FileId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ModelConceptImages_ModelId_SortOrder",
                table: "ModelConceptImages",
                columns: new[] { "ModelId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectConceptImages_FileId",
                table: "ProjectConceptImages",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectConceptImages_ProjectId_FileId",
                table: "ProjectConceptImages",
                columns: new[] { "ProjectId", "FileId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectConceptImages_ProjectId_SortOrder",
                table: "ProjectConceptImages",
                columns: new[] { "ProjectId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_Models_ModelCategories_ModelCategoryId",
                table: "Models",
                column: "ModelCategoryId",
                principalTable: "ModelCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Packs_Files_CustomThumbnailFileId",
                table: "Packs",
                column: "CustomThumbnailFileId",
                principalTable: "Files",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_Files_CustomThumbnailFileId",
                table: "Projects",
                column: "CustomThumbnailFileId",
                principalTable: "Files",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Models_ModelCategories_ModelCategoryId",
                table: "Models");

            migrationBuilder.DropForeignKey(
                name: "FK_Packs_Files_CustomThumbnailFileId",
                table: "Packs");

            migrationBuilder.DropForeignKey(
                name: "FK_Projects_Files_CustomThumbnailFileId",
                table: "Projects");

            migrationBuilder.DropTable(
                name: "ModelCategories");

            migrationBuilder.DropTable(
                name: "ModelConceptImages");

            migrationBuilder.DropTable(
                name: "ProjectConceptImages");

            migrationBuilder.DropIndex(
                name: "IX_Projects_CustomThumbnailFileId",
                table: "Projects");

            migrationBuilder.DropIndex(
                name: "IX_Packs_CustomThumbnailFileId",
                table: "Packs");

            migrationBuilder.DropIndex(
                name: "IX_Packs_LicenseType",
                table: "Packs");

            migrationBuilder.DropIndex(
                name: "IX_Models_ModelCategoryId",
                table: "Models");

            migrationBuilder.DropColumn(
                name: "CustomThumbnailFileId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "CustomThumbnailFileId",
                table: "Packs");

            migrationBuilder.DropColumn(
                name: "LicenseType",
                table: "Packs");

            migrationBuilder.DropColumn(
                name: "Url",
                table: "Packs");

            migrationBuilder.DropColumn(
                name: "MaterialCount",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "MeshCount",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "TechnicalDetailsUpdatedAt",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "TriangleCount",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "VertexCount",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "ModelCategoryId",
                table: "Models");
        }
    }
}
