using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTextureSetToModelVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DefaultTextureSetId",
                table: "ModelVersions",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ModelVersionTextureSets",
                columns: table => new
                {
                    ModelVersionsId = table.Column<int>(type: "integer", nullable: false),
                    TextureSetsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelVersionTextureSets", x => new { x.ModelVersionsId, x.TextureSetsId });
                    table.ForeignKey(
                        name: "FK_ModelVersionTextureSets_ModelVersions_ModelVersionsId",
                        column: x => x.ModelVersionsId,
                        principalTable: "ModelVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ModelVersionTextureSets_TextureSets_TextureSetsId",
                        column: x => x.TextureSetsId,
                        principalTable: "TextureSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ModelVersions_DefaultTextureSetId",
                table: "ModelVersions",
                column: "DefaultTextureSetId");

            migrationBuilder.CreateIndex(
                name: "IX_ModelVersionTextureSets_TextureSetsId",
                table: "ModelVersionTextureSets",
                column: "TextureSetsId");

            migrationBuilder.AddForeignKey(
                name: "FK_ModelVersions_TextureSets_DefaultTextureSetId",
                table: "ModelVersions",
                column: "DefaultTextureSetId",
                principalTable: "TextureSets",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // Data migration: Copy Model-TextureSet associations to ModelVersion-TextureSet
            // Associate texture sets with the active version of each model
            migrationBuilder.Sql(@"
                INSERT INTO ""ModelVersionTextureSets"" (""ModelVersionsId"", ""TextureSetsId"")
                SELECT m.""ActiveVersionId"", mts.""TextureSetsId""
                FROM ""ModelTextureSets"" mts
                INNER JOIN ""Models"" m ON mts.""ModelsId"" = m.""Id""
                WHERE m.""ActiveVersionId"" IS NOT NULL
                ON CONFLICT DO NOTHING;
            ");

            // Data migration: Copy default texture set from Model to active ModelVersion
            migrationBuilder.Sql(@"
                UPDATE ""ModelVersions"" mv
                SET ""DefaultTextureSetId"" = m.""DefaultTextureSetId""
                FROM ""Models"" m
                WHERE mv.""Id"" = m.""ActiveVersionId""
                AND m.""DefaultTextureSetId"" IS NOT NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ModelVersions_TextureSets_DefaultTextureSetId",
                table: "ModelVersions");

            migrationBuilder.DropTable(
                name: "ModelVersionTextureSets");

            migrationBuilder.DropIndex(
                name: "IX_ModelVersions_DefaultTextureSetId",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "DefaultTextureSetId",
                table: "ModelVersions");
        }
    }
}
