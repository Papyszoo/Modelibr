using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEnvironmentMapCubeVariants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_EnvironmentMapVariants_EnvironmentMapId",
                table: "EnvironmentMapVariants");

            migrationBuilder.AlterColumn<int>(
                name: "FileId",
                table: "EnvironmentMapVariants",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<int>(
                name: "ProjectionType",
                table: "EnvironmentMapVariants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "CustomThumbnailFileId",
                table: "EnvironmentMaps",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EnvironmentMapVariantFaceFiles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    EnvironmentMapVariantId = table.Column<int>(type: "integer", nullable: false),
                    Face = table.Column<int>(type: "integer", nullable: false),
                    FileId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnvironmentMapVariantFaceFiles", x => x.Id);
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
                name: "IX_EnvironmentMaps_CustomThumbnailFileId",
                table: "EnvironmentMaps",
                column: "CustomThumbnailFileId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariantFaceFiles_EnvironmentMapVariantId_Face",
                table: "EnvironmentMapVariantFaceFiles",
                columns: new[] { "EnvironmentMapVariantId", "Face" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariantFaceFiles_FileId",
                table: "EnvironmentMapVariantFaceFiles",
                column: "FileId");

            migrationBuilder.AddForeignKey(
                name: "FK_EnvironmentMaps_Files_CustomThumbnailFileId",
                table: "EnvironmentMaps",
                column: "CustomThumbnailFileId",
                principalTable: "Files",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EnvironmentMaps_Files_CustomThumbnailFileId",
                table: "EnvironmentMaps");

            migrationBuilder.DropTable(
                name: "EnvironmentMapVariantFaceFiles");

            migrationBuilder.DropIndex(
                name: "IX_EnvironmentMaps_CustomThumbnailFileId",
                table: "EnvironmentMaps");

            migrationBuilder.DropColumn(
                name: "ProjectionType",
                table: "EnvironmentMapVariants");

            migrationBuilder.DropColumn(
                name: "CustomThumbnailFileId",
                table: "EnvironmentMaps");

            migrationBuilder.AlterColumn<int>(
                name: "FileId",
                table: "EnvironmentMapVariants",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapVariants_EnvironmentMapId",
                table: "EnvironmentMapVariants",
                column: "EnvironmentMapId");
        }
    }
}
