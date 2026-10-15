using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectCommentsAndVfx : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ProductionNotes_OneTarget",
                table: "ProductionNotes");

            migrationBuilder.AddColumn<int>(
                name: "EnvironmentMapId",
                table: "ProductionNotes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ModelId",
                table: "ProductionNotes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Resolution",
                table: "ProductionNotes",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SoundId",
                table: "ProductionNotes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SpriteId",
                table: "ProductionNotes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "ProductionNotes",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "open");

            migrationBuilder.AddColumn<int>(
                name: "TextureSetId",
                table: "ProductionNotes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VfxId",
                table: "ProductionNotes",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProjectVfx",
                columns: table => new
                {
                    ProjectsId = table.Column<int>(type: "integer", nullable: false),
                    VfxId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectVfx", x => new { x.ProjectsId, x.VfxId });
                    table.ForeignKey(
                        name: "FK_ProjectVfx_Projects_ProjectsId",
                        column: x => x.ProjectsId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectVfx_Vfx_VfxId",
                        column: x => x.VfxId,
                        principalTable: "Vfx",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_EnvironmentMapId",
                table: "ProductionNotes",
                column: "EnvironmentMapId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_ModelId",
                table: "ProductionNotes",
                column: "ModelId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_ProjectId_Status",
                table: "ProductionNotes",
                columns: new[] { "ProjectId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_SoundId",
                table: "ProductionNotes",
                column: "SoundId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_SpriteId",
                table: "ProductionNotes",
                column: "SpriteId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_TextureSetId",
                table: "ProductionNotes",
                column: "TextureSetId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductionNotes_VfxId",
                table: "ProductionNotes",
                column: "VfxId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ProductionNotes_OneTarget",
                table: "ProductionNotes",
                sql: "(CASE WHEN \"LevelId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"ReferenceImageId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"CharacterId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"ModelId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"TextureSetId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"SpriteId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"SoundId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"EnvironmentMapId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"VfxId\" IS NOT NULL THEN 1 ELSE 0 END) <= 1");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ProductionNotes_Status",
                table: "ProductionNotes",
                sql: "\"Status\" IN ('open', 'resolved')");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectVfx_VfxId",
                table: "ProjectVfx",
                column: "VfxId");

            migrationBuilder.AddForeignKey(
                name: "FK_ProductionNotes_EnvironmentMaps_EnvironmentMapId",
                table: "ProductionNotes",
                column: "EnvironmentMapId",
                principalTable: "EnvironmentMaps",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ProductionNotes_Models_ModelId",
                table: "ProductionNotes",
                column: "ModelId",
                principalTable: "Models",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ProductionNotes_Sounds_SoundId",
                table: "ProductionNotes",
                column: "SoundId",
                principalTable: "Sounds",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ProductionNotes_Sprites_SpriteId",
                table: "ProductionNotes",
                column: "SpriteId",
                principalTable: "Sprites",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ProductionNotes_TextureSets_TextureSetId",
                table: "ProductionNotes",
                column: "TextureSetId",
                principalTable: "TextureSets",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ProductionNotes_Vfx_VfxId",
                table: "ProductionNotes",
                column: "VfxId",
                principalTable: "Vfx",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ProductionNotes_EnvironmentMaps_EnvironmentMapId",
                table: "ProductionNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_ProductionNotes_Models_ModelId",
                table: "ProductionNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_ProductionNotes_Sounds_SoundId",
                table: "ProductionNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_ProductionNotes_Sprites_SpriteId",
                table: "ProductionNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_ProductionNotes_TextureSets_TextureSetId",
                table: "ProductionNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_ProductionNotes_Vfx_VfxId",
                table: "ProductionNotes");

            migrationBuilder.DropTable(
                name: "ProjectVfx");

            migrationBuilder.DropIndex(
                name: "IX_ProductionNotes_EnvironmentMapId",
                table: "ProductionNotes");

            migrationBuilder.DropIndex(
                name: "IX_ProductionNotes_ModelId",
                table: "ProductionNotes");

            migrationBuilder.DropIndex(
                name: "IX_ProductionNotes_ProjectId_Status",
                table: "ProductionNotes");

            migrationBuilder.DropIndex(
                name: "IX_ProductionNotes_SoundId",
                table: "ProductionNotes");

            migrationBuilder.DropIndex(
                name: "IX_ProductionNotes_SpriteId",
                table: "ProductionNotes");

            migrationBuilder.DropIndex(
                name: "IX_ProductionNotes_TextureSetId",
                table: "ProductionNotes");

            migrationBuilder.DropIndex(
                name: "IX_ProductionNotes_VfxId",
                table: "ProductionNotes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ProductionNotes_OneTarget",
                table: "ProductionNotes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ProductionNotes_Status",
                table: "ProductionNotes");

            migrationBuilder.DropColumn(
                name: "EnvironmentMapId",
                table: "ProductionNotes");

            migrationBuilder.DropColumn(
                name: "ModelId",
                table: "ProductionNotes");

            migrationBuilder.DropColumn(
                name: "Resolution",
                table: "ProductionNotes");

            migrationBuilder.DropColumn(
                name: "SoundId",
                table: "ProductionNotes");

            migrationBuilder.DropColumn(
                name: "SpriteId",
                table: "ProductionNotes");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "ProductionNotes");

            migrationBuilder.DropColumn(
                name: "TextureSetId",
                table: "ProductionNotes");

            migrationBuilder.DropColumn(
                name: "VfxId",
                table: "ProductionNotes");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ProductionNotes_OneTarget",
                table: "ProductionNotes",
                sql: "(CASE WHEN \"LevelId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"ReferenceImageId\" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN \"CharacterId\" IS NOT NULL THEN 1 ELSE 0 END) <= 1");
        }
    }
}
