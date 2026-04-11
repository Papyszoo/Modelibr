using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SyncAssetCategoryThumbnailSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EnvironmentMaps_ModelCategories_ModelCategoryId",
                table: "EnvironmentMaps");

            migrationBuilder.DropIndex(
                name: "IX_SpriteCategories_Name",
                table: "SpriteCategories");

            migrationBuilder.DropIndex(
                name: "IX_SoundCategories_Name",
                table: "SoundCategories");

            migrationBuilder.RenameColumn(
                name: "ModelCategoryId",
                table: "EnvironmentMaps",
                newName: "EnvironmentMapCategoryId");

            migrationBuilder.RenameIndex(
                name: "IX_EnvironmentMaps_ModelCategoryId",
                table: "EnvironmentMaps",
                newName: "IX_EnvironmentMaps_EnvironmentMapCategoryId");

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

            migrationBuilder.AddColumn<string>(
                name: "ThumbnailPath",
                table: "EnvironmentMapVariants",
                type: "character varying(500)",
                maxLength: 500,
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
                name: "IX_EnvironmentMapCategories_ParentId_Name",
                table: "EnvironmentMapCategories",
                columns: new[] { "ParentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TextureSetCategories_ParentId_Name",
                table: "TextureSetCategories",
                columns: new[] { "ParentId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_EnvironmentMaps_EnvironmentMapCategories_EnvironmentMapCate~",
                table: "EnvironmentMaps",
                column: "EnvironmentMapCategoryId",
                principalTable: "EnvironmentMapCategories",
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
                name: "FK_EnvironmentMaps_EnvironmentMapCategories_EnvironmentMapCate~",
                table: "EnvironmentMaps");

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
                name: "EnvironmentMapCategories");

            migrationBuilder.DropTable(
                name: "TextureSetCategories");

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
                name: "ThumbnailPath",
                table: "EnvironmentMapVariants");

            migrationBuilder.RenameColumn(
                name: "EnvironmentMapCategoryId",
                table: "EnvironmentMaps",
                newName: "ModelCategoryId");

            migrationBuilder.RenameIndex(
                name: "IX_EnvironmentMaps_EnvironmentMapCategoryId",
                table: "EnvironmentMaps",
                newName: "IX_EnvironmentMaps_ModelCategoryId");

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

            migrationBuilder.AddForeignKey(
                name: "FK_EnvironmentMaps_ModelCategories_ModelCategoryId",
                table: "EnvironmentMaps",
                column: "ModelCategoryId",
                principalTable: "ModelCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
