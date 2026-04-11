using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEnvironmentMapMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ModelCategoryId",
                table: "EnvironmentMaps",
                type: "integer",
                nullable: true);

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

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMaps_ModelCategoryId",
                table: "EnvironmentMaps",
                column: "ModelCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentMapTagAssignments_ModelTagId",
                table: "EnvironmentMapTagAssignments",
                column: "ModelTagId");

            migrationBuilder.AddForeignKey(
                name: "FK_EnvironmentMaps_ModelCategories_ModelCategoryId",
                table: "EnvironmentMaps",
                column: "ModelCategoryId",
                principalTable: "ModelCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EnvironmentMaps_ModelCategories_ModelCategoryId",
                table: "EnvironmentMaps");

            migrationBuilder.DropTable(
                name: "EnvironmentMapTagAssignments");

            migrationBuilder.DropIndex(
                name: "IX_EnvironmentMaps_ModelCategoryId",
                table: "EnvironmentMaps");

            migrationBuilder.DropColumn(
                name: "ModelCategoryId",
                table: "EnvironmentMaps");
        }
    }
}
