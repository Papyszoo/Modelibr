using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEnvironmentMaps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SpriteCategories_Name",
                table: "SpriteCategories");

            migrationBuilder.DropIndex(
                name: "IX_SoundCategories_Name",
                table: "SoundCategories");

            migrationBuilder.AddColumn<int>(
                name: "EnvironmentMapId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EnvironmentMapVariantId",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TextureSetCategoryId",
                table: "TextureSets",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ParentId",
                table: "SpriteCategories",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ParentId",
                table: "SoundCategories",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EnvironmentMapId",
                table: "BatchUploads",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EnvironmentMapCategories",
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
                    table.PrimaryKey("PK_EnvironmentMapCategories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EnvironmentMapCategories_EnvironmentMapCategories_ParentId",
                        column: x => x.ParentId,
                        principalTable: "EnvironmentMapCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TextureSetCategories",
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
                    table.PrimaryKey("PK_TextureSetCategories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TextureSetCategories_TextureSetCategories_ParentId",
                        column: x => x.ParentId,
                        principalTable: "TextureSetCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EnvironmentMaps",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    PreviewVariantId = table.Column<int>(type: "integer", nullable: true),
                    CustomThumbnailFileId = table.Column<int>(type: "integer", nullable: true),
                    EnvironmentMapCategoryId = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnvironmentMaps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EnvironmentMaps_EnvironmentMapCategories_EnvironmentMapCate~",
                        column: x => x.EnvironmentMapCategoryId,
                        principalTable: "EnvironmentMapCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_EnvironmentMaps_Files_CustomThumbnailFileId",
                        column: x => x.CustomThumbnailFileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "EnvironmentMapTagAssignments",
                columns: table => new
                {
                    EnvironmentMapId = table.Column<int>(type: "integer", nullable: false),
                    ModelTagId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnvironmentMapTagAssignments", x => new { x.EnvironmentMapId, x.ModelTagId });
                    table.ForeignKey(
                        name: "FK_EnvironmentMapTagAssignments_EnvironmentMaps_EnvironmentMap~",
                        column: x => x.EnvironmentMapId,
                        principalTable: "EnvironmentMaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EnvironmentMapTagAssignments_ModelTags_ModelTagId",
                        column: x => x.ModelTagId,
                        principalTable: "ModelTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EnvironmentMapVariants",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    EnvironmentMapId = table.Column<int>(type: "integer", nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: true),
                    ProjectionType = table.Column<int>(type: "integer", nullable: false),
                    SizeLabel = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ThumbnailPath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnvironmentMapVariants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EnvironmentMapVariants_EnvironmentMaps_EnvironmentMapId",
                        column: x => x.EnvironmentMapId,
                        principalTable: "EnvironmentMaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EnvironmentMapVariants_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PackEnvironmentMaps",
                columns: table => new
                {
                    EnvironmentMapsId = table.Column<int>(type: "integer", nullable: false),
                    PacksId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackEnvironmentMaps", x => new { x.EnvironmentMapsId, x.PacksId });
                    table.ForeignKey(
                        name: "FK_PackEnvironmentMaps_EnvironmentMaps_EnvironmentMapsId",
                        column: x => x.EnvironmentMapsId,
                        principalTable: "EnvironmentMaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PackEnvironmentMaps_Packs_PacksId",
                        column: x => x.PacksId,
                        principalTable: "Packs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectEnvironmentMaps",
                columns: table => new
                {
                    EnvironmentMapsId = table.Column<int>(type: "integer", nullable: false),
                    ProjectsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectEnvironmentMaps", x => new { x.EnvironmentMapsId, x.ProjectsId });
                    table.ForeignKey(
                        name: "FK_ProjectEnvironmentMaps_EnvironmentMaps_EnvironmentMapsId",
                        column: x => x.EnvironmentMapsId,
                        principalTable: "EnvironmentMaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectEnvironmentMaps_Projects_ProjectsId",
                        column: x => x.ProjectsId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EnvironmentMapVariantFaceFiles",
                columns: table => new
                {
                    EnvironmentMapVariantId = table.Column<int>(type: "integer", nullable: false),
                    Face = table.Column<int>(type: "integer", nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnvironmentMapVariantFaceFiles", x => new { x.EnvironmentMapVariantId, x.Face });
                    table.ForeignKey(
                        name: "FK_EnvironmentMapVariantFaceFiles_EnvironmentMapVariants_Envir~",
                        column: x => x.EnvironmentMapVariantId,
                        principalTable: "EnvironmentMapVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EnvironmentMapVariantFaceFiles_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_EnvironmentMapId",
                table: "ThumbnailJobs",
                column: "EnvironmentMapId");

            migrationBuilder.CreateIndex(
                name: "IX_ThumbnailJobs_EnvironmentMapVariantId",
                table: "ThumbnailJobs",
                column: "EnvironmentMapVariantId",
                unique: true,
                filter: "\"EnvironmentMapVariantId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_TextureSets_TextureSetCategoryId",
                table: "TextureSets",
                column: "TextureSetCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_SpriteCategories_ParentId_Name",
                table: "SpriteCategories",
                columns: new[] { "ParentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SoundCategories_ParentId_Name",
                table: "SoundCategories",
                columns: new[] { "ParentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BatchUploads_EnvironmentMapId",
                table: "BatchUploads",
                column: "EnvironmentMapId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapCategories_ParentId_Name",
                table: "EnvironmentMapCategories",
                columns: new[] { "ParentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMaps_CustomThumbnailFileId",
                table: "EnvironmentMaps",
                column: "CustomThumbnailFileId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMaps_EnvironmentMapCategoryId",
                table: "EnvironmentMaps",
                column: "EnvironmentMapCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMaps_IsDeleted",
                table: "EnvironmentMaps",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMaps_Name",
                table: "EnvironmentMaps",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapTagAssignments_ModelTagId",
                table: "EnvironmentMapTagAssignments",
                column: "ModelTagId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariantFaceFiles_FileId",
                table: "EnvironmentMapVariantFaceFiles",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariants_EnvironmentMapId_SizeLabel",
                table: "EnvironmentMapVariants",
                columns: new[] { "EnvironmentMapId", "SizeLabel" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariants_FileId",
                table: "EnvironmentMapVariants",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariants_IsDeleted",
                table: "EnvironmentMapVariants",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_PackEnvironmentMaps_PacksId",
                table: "PackEnvironmentMaps",
                column: "PacksId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectEnvironmentMaps_ProjectsId",
                table: "ProjectEnvironmentMaps",
                column: "ProjectsId");

            migrationBuilder.CreateIndex(
                name: "IX_TextureSetCategories_ParentId_Name",
                table: "TextureSetCategories",
                columns: new[] { "ParentId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_BatchUploads_EnvironmentMaps_EnvironmentMapId",
                table: "BatchUploads",
                column: "EnvironmentMapId",
                principalTable: "EnvironmentMaps",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_SoundCategories_SoundCategories_ParentId",
                table: "SoundCategories",
                column: "ParentId",
                principalTable: "SoundCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SpriteCategories_SpriteCategories_ParentId",
                table: "SpriteCategories",
                column: "ParentId",
                principalTable: "SpriteCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TextureSets_TextureSetCategories_TextureSetCategoryId",
                table: "TextureSets",
                column: "TextureSetCategoryId",
                principalTable: "TextureSetCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ThumbnailJobs_EnvironmentMapVariants_EnvironmentMapVariantId",
                table: "ThumbnailJobs",
                column: "EnvironmentMapVariantId",
                principalTable: "EnvironmentMapVariants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_ThumbnailJobs_EnvironmentMaps_EnvironmentMapId",
                table: "ThumbnailJobs",
                column: "EnvironmentMapId",
                principalTable: "EnvironmentMaps",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BatchUploads_EnvironmentMaps_EnvironmentMapId",
                table: "BatchUploads");

            migrationBuilder.DropForeignKey(
                name: "FK_SoundCategories_SoundCategories_ParentId",
                table: "SoundCategories");

            migrationBuilder.DropForeignKey(
                name: "FK_SpriteCategories_SpriteCategories_ParentId",
                table: "SpriteCategories");

            migrationBuilder.DropForeignKey(
                name: "FK_TextureSets_TextureSetCategories_TextureSetCategoryId",
                table: "TextureSets");

            migrationBuilder.DropForeignKey(
                name: "FK_ThumbnailJobs_EnvironmentMapVariants_EnvironmentMapVariantId",
                table: "ThumbnailJobs");

            migrationBuilder.DropForeignKey(
                name: "FK_ThumbnailJobs_EnvironmentMaps_EnvironmentMapId",
                table: "ThumbnailJobs");

            migrationBuilder.DropTable(
                name: "EnvironmentMapTagAssignments");

            migrationBuilder.DropTable(
                name: "EnvironmentMapVariantFaceFiles");

            migrationBuilder.DropTable(
                name: "PackEnvironmentMaps");

            migrationBuilder.DropTable(
                name: "ProjectEnvironmentMaps");

            migrationBuilder.DropTable(
                name: "TextureSetCategories");

            migrationBuilder.DropTable(
                name: "EnvironmentMapVariants");

            migrationBuilder.DropTable(
                name: "EnvironmentMaps");

            migrationBuilder.DropTable(
                name: "EnvironmentMapCategories");

            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_EnvironmentMapId",
                table: "ThumbnailJobs");

            migrationBuilder.DropIndex(
                name: "IX_ThumbnailJobs_EnvironmentMapVariantId",
                table: "ThumbnailJobs");

            migrationBuilder.DropIndex(
                name: "IX_TextureSets_TextureSetCategoryId",
                table: "TextureSets");

            migrationBuilder.DropIndex(
                name: "IX_SpriteCategories_ParentId_Name",
                table: "SpriteCategories");

            migrationBuilder.DropIndex(
                name: "IX_SoundCategories_ParentId_Name",
                table: "SoundCategories");

            migrationBuilder.DropIndex(
                name: "IX_BatchUploads_EnvironmentMapId",
                table: "BatchUploads");

            migrationBuilder.DropColumn(
                name: "EnvironmentMapId",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "EnvironmentMapVariantId",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "TextureSetCategoryId",
                table: "TextureSets");

            migrationBuilder.DropColumn(
                name: "ParentId",
                table: "SpriteCategories");

            migrationBuilder.DropColumn(
                name: "ParentId",
                table: "SoundCategories");

            migrationBuilder.DropColumn(
                name: "EnvironmentMapId",
                table: "BatchUploads");

            migrationBuilder.CreateIndex(
                name: "IX_SpriteCategories_Name",
                table: "SpriteCategories",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SoundCategories_Name",
                table: "SoundCategories",
                column: "Name",
                unique: true);
        }
    }
}
