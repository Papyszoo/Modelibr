using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectCharacters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ProductionNotes_OneTarget",
                table: "ProductionNotes");

            migrationBuilder.AddColumn<int>(
                name: "CharacterId",
                table: "ProductionNotes",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProjectCharacters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectCharacters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectCharacters_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectCharacterTags",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectCharacterTags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectCharacterTags_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CharacterAbilities",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    ProjectCharacterId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterAbilities", x => x.Id);
                    table.CheckConstraint("CK_CharacterAbilities_SortOrder", "\"SortOrder\" >= 0");
                    table.ForeignKey(
                        name: "FK_CharacterAbilities_ProjectCharacters_ProjectCharacterId",
                        column: x => x.ProjectCharacterId,
                        principalTable: "ProjectCharacters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CharacterAbilities_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CharacterVariants",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    ProjectCharacterId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ProjectLevelId = table.Column<int>(type: "integer", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterVariants", x => x.Id);
                    table.CheckConstraint("CK_CharacterVariants_SortOrder", "\"SortOrder\" >= 0");
                    table.ForeignKey(
                        name: "FK_CharacterVariants_ProjectCharacters_ProjectCharacterId",
                        column: x => x.ProjectCharacterId,
                        principalTable: "ProjectCharacters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CharacterVariants_ProjectLevels_ProjectLevelId",
                        column: x => x.ProjectLevelId,
                        principalTable: "ProjectLevels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_CharacterVariants_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectCharacterImages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    ProjectCharacterId = table.Column<int>(type: "integer", nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: true),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Caption = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectCharacterImages", x => x.Id);
                    table.CheckConstraint("CK_ProjectCharacterImages_SortOrder", "\"SortOrder\" >= 0");
                    table.ForeignKey(
                        name: "FK_ProjectCharacterImages_Files_FileId",
                        column: x => x.FileId,
                        principalTable: "Files",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ProjectCharacterImages_ProjectCharacters_ProjectCharacterId",
                        column: x => x.ProjectCharacterId,
                        principalTable: "ProjectCharacters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectCharacterImages_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectCharacterModels",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    ProjectCharacterId = table.Column<int>(type: "integer", nullable: false),
                    ModelId = table.Column<int>(type: "integer", nullable: true),
                    Label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectCharacterModels", x => x.Id);
                    table.CheckConstraint("CK_ProjectCharacterModels_SortOrder", "\"SortOrder\" >= 0");
                    table.ForeignKey(
                        name: "FK_ProjectCharacterModels_Models_ModelId",
                        column: x => x.ModelId,
                        principalTable: "Models",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ProjectCharacterModels_ProjectCharacters_ProjectCharacterId",
                        column: x => x.ProjectCharacterId,
                        principalTable: "ProjectCharacters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectCharacterModels_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectCharacterTagAssignments",
                columns: table => new
                {
                    ProjectCharacterId = table.Column<int>(type: "integer", nullable: false),
                    ProjectCharacterTagId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectCharacterTagAssignments", x => new { x.ProjectCharacterId, x.ProjectCharacterTagId });
                    table.ForeignKey(
                        name: "FK_ProjectCharacterTagAssignments_ProjectCharacterTags_Project~",
                        column: x => x.ProjectCharacterTagId,
                        principalTable: "ProjectCharacterTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectCharacterTagAssignments_ProjectCharacters_ProjectCha~",
                        column: x => x.ProjectCharacterId,
                        principalTable: "ProjectCharacters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_CharacterId",
                table: "ProductionNotes",
                column: "CharacterId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_ProjectId_CharacterId",
                table: "ProductionNotes",
                columns: new[] { "ProjectId", "CharacterId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_ProductionNotes_OneTarget",
                table: "ProductionNotes",
                sql: "(CASE WHEN \"LevelId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"ReferenceImageId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"CharacterId\" IS NOT NULL THEN 1 ELSE 0 END) <= 1");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterAbilities_ProjectCharacterId_SortOrder",
                table: "CharacterAbilities",
                columns: new[] { "ProjectCharacterId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_CharacterAbilities_ProjectId",
                table: "CharacterAbilities",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterVariants_ProjectCharacterId_SortOrder",
                table: "CharacterVariants",
                columns: new[] { "ProjectCharacterId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_CharacterVariants_ProjectId",
                table: "CharacterVariants",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterVariants_ProjectLevelId",
                table: "CharacterVariants",
                column: "ProjectLevelId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterImages_FileId",
                table: "ProjectCharacterImages",
                column: "FileId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterImages_ProjectCharacterId_FileId",
                table: "ProjectCharacterImages",
                columns: new[] { "ProjectCharacterId", "FileId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterImages_ProjectCharacterId_SortOrder",
                table: "ProjectCharacterImages",
                columns: new[] { "ProjectCharacterId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterImages_ProjectId",
                table: "ProjectCharacterImages",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterModels_ModelId",
                table: "ProjectCharacterModels",
                column: "ModelId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterModels_ProjectCharacterId_ModelId",
                table: "ProjectCharacterModels",
                columns: new[] { "ProjectCharacterId", "ModelId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterModels_ProjectCharacterId_SortOrder",
                table: "ProjectCharacterModels",
                columns: new[] { "ProjectCharacterId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterModels_ProjectId",
                table: "ProjectCharacterModels",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacters_ProjectId_Name",
                table: "ProjectCharacters",
                columns: new[] { "ProjectId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacters_ProjectId_UpdatedAt",
                table: "ProjectCharacters",
                columns: new[] { "ProjectId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterTagAssignments_ProjectCharacterTagId",
                table: "ProjectCharacterTagAssignments",
                column: "ProjectCharacterTagId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCharacterTags_ProjectId_NormalizedName",
                table: "ProjectCharacterTags",
                columns: new[] { "ProjectId", "NormalizedName" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_ProductionNotes_ProjectCharacters_CharacterId",
                table: "ProductionNotes",
                column: "CharacterId",
                principalTable: "ProjectCharacters",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ProductionNotes_ProjectCharacters_CharacterId",
                table: "ProductionNotes");

            migrationBuilder.DropTable(
                name: "CharacterAbilities");

            migrationBuilder.DropTable(
                name: "CharacterVariants");

            migrationBuilder.DropTable(
                name: "ProjectCharacterImages");

            migrationBuilder.DropTable(
                name: "ProjectCharacterModels");

            migrationBuilder.DropTable(
                name: "ProjectCharacterTagAssignments");

            migrationBuilder.DropTable(
                name: "ProjectCharacterTags");

            migrationBuilder.DropTable(
                name: "ProjectCharacters");

            migrationBuilder.DropIndex(
                name: "IX_ProductionNotes_CharacterId",
                table: "ProductionNotes");

            migrationBuilder.DropIndex(
                name: "IX_ProductionNotes_ProjectId_CharacterId",
                table: "ProductionNotes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ProductionNotes_OneTarget",
                table: "ProductionNotes");

            migrationBuilder.DropColumn(
                name: "CharacterId",
                table: "ProductionNotes");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ProductionNotes_OneTarget",
                table: "ProductionNotes",
                sql: "\"LevelId\" IS NULL OR \"ReferenceImageId\" IS NULL");
        }
    }
}
