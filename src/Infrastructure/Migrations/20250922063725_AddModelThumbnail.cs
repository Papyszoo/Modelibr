using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddModelThumbnail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Thumbnails_ModelId_Format",
                table: "Thumbnails");

            migrationBuilder.DropColumn(
                name: "Format",
                table: "Thumbnails");

            migrationBuilder.CreateIndex(
                name: "IX_Thumbnails_ModelId",
                table: "Thumbnails",
                column: "ModelId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Thumbnails_ModelId",
                table: "Thumbnails");

            migrationBuilder.AddColumn<string>(
                name: "Format",
                table: "Thumbnails",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_Thumbnails_ModelId_Format",
                table: "Thumbnails",
                columns: new[] { "ModelId", "Format" },
                unique: true);
        }
    }
}
