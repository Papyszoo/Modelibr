using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddModelMetadataFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Faces",
                table: "Models",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PolyCount",
                table: "Models",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Vertices",
                table: "Models",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Models_Name_Vertices",
                table: "Models",
                columns: new[] { "Name", "Vertices" });

            migrationBuilder.CreateIndex(
                name: "IX_Models_PolyCount",
                table: "Models",
                column: "PolyCount");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Models_Name_Vertices",
                table: "Models");

            migrationBuilder.DropIndex(
                name: "IX_Models_PolyCount",
                table: "Models");

            migrationBuilder.DropColumn(
                name: "Faces",
                table: "Models");

            migrationBuilder.DropColumn(
                name: "PolyCount",
                table: "Models");

            migrationBuilder.DropColumn(
                name: "Vertices",
                table: "Models");
        }
    }
}
