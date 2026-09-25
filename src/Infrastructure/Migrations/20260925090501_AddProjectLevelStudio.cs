using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectLevelStudio : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPrimaryLevelScene",
                table: "Scenes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "ProjectLevelId",
                table: "Scenes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ProjectLevelId",
                table: "ProjectConceptImages",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Title",
                table: "ProjectConceptImages",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ProjectLevels",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ProductionStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectLevels", x => x.Id);
                    table.CheckConstraint("CK_ProjectLevels_ProductionStatus", "\"ProductionStatus\" IN ('planned', 'in_progress', 'review', 'blocked', 'done')");
                    table.ForeignKey(
                        name: "FK_ProjectLevels_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProductionNotes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    LevelId = table.Column<int>(type: "integer", nullable: true),
                    ReferenceImageId = table.Column<int>(type: "integer", nullable: true),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Body = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    IsPinned = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductionNotes", x => x.Id);
                    table.CheckConstraint("CK_ProductionNotes_OneTarget", "\"LevelId\" IS NULL OR \"ReferenceImageId\" IS NULL");
                    table.ForeignKey(
                        name: "FK_ProductionNotes_ProjectConceptImages_ReferenceImageId",
                        column: x => x.ReferenceImageId,
                        principalTable: "ProjectConceptImages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ProductionNotes_ProjectLevels_LevelId",
                        column: x => x.LevelId,
                        principalTable: "ProjectLevels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ProductionNotes_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_PrimaryLevel",
                table: "Scenes",
                column: "ProjectLevelId",
                unique: true,
                filter: "\"ProjectLevelId\" IS NOT NULL AND \"IsPrimaryLevelScene\" = true");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Scenes_PrimaryLevelRequiresLevel",
                table: "Scenes",
                sql: "\"IsPrimaryLevelScene\" = false OR \"ProjectLevelId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectConceptImages_ProjectLevelId_SortOrder",
                table: "ProjectConceptImages",
                columns: new[] { "ProjectLevelId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_LevelId",
                table: "ProductionNotes",
                column: "LevelId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_ProjectId_IsPinned",
                table: "ProductionNotes",
                columns: new[] { "ProjectId", "IsPinned" });

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_ProjectId_LevelId",
                table: "ProductionNotes",
                columns: new[] { "ProjectId", "LevelId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_ProjectId_ReferenceImageId",
                table: "ProductionNotes",
                columns: new[] { "ProjectId", "ReferenceImageId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_ProjectId_UpdatedAt",
                table: "ProductionNotes",
                columns: new[] { "ProjectId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_ReferenceImageId",
                table: "ProductionNotes",
                column: "ReferenceImageId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectLevels_ProjectId_Name",
                table: "ProjectLevels",
                columns: new[] { "ProjectId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectLevels_ProjectId_SortOrder",
                table: "ProjectLevels",
                columns: new[] { "ProjectId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_ProjectConceptImages_ProjectLevels_ProjectLevelId",
                table: "ProjectConceptImages",
                column: "ProjectLevelId",
                principalTable: "ProjectLevels",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Scenes_ProjectLevels_ProjectLevelId",
                table: "Scenes",
                column: "ProjectLevelId",
                principalTable: "ProjectLevels",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ProjectConceptImages_ProjectLevels_ProjectLevelId",
                table: "ProjectConceptImages");

            migrationBuilder.DropForeignKey(
                name: "FK_Scenes_ProjectLevels_ProjectLevelId",
                table: "Scenes");

            migrationBuilder.DropTable(
                name: "ProductionNotes");

            migrationBuilder.DropTable(
                name: "ProjectLevels");

            migrationBuilder.DropIndex(
                name: "IX_Scenes_PrimaryLevel",
                table: "Scenes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Scenes_PrimaryLevelRequiresLevel",
                table: "Scenes");

            migrationBuilder.DropIndex(
                name: "IX_ProjectConceptImages_ProjectLevelId_SortOrder",
                table: "ProjectConceptImages");

            migrationBuilder.DropColumn(
                name: "IsPrimaryLevelScene",
                table: "Scenes");

            migrationBuilder.DropColumn(
                name: "ProjectLevelId",
                table: "Scenes");

            migrationBuilder.DropColumn(
                name: "ProjectLevelId",
                table: "ProjectConceptImages");

            migrationBuilder.DropColumn(
                name: "Title",
                table: "ProjectConceptImages");
        }
    }
}
