using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddThumbnailsForModels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Thumbnails_Files_FileId",
                table: "Thumbnails");

            migrationBuilder.RenameColumn(
                name: "FileId",
                table: "Thumbnails",
                newName: "ModelId");

            migrationBuilder.RenameIndex(
                name: "IX_Thumbnails_FileId_Format",
                table: "Thumbnails",
                newName: "IX_Thumbnails_ModelId_Format");

            migrationBuilder.AddForeignKey(
                name: "FK_Thumbnails_Models_ModelId",
                table: "Thumbnails",
                column: "ModelId",
                principalTable: "Models",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Thumbnails_Models_ModelId",
                table: "Thumbnails");

            migrationBuilder.RenameColumn(
                name: "ModelId",
                table: "Thumbnails",
                newName: "FileId");

            migrationBuilder.RenameIndex(
                name: "IX_Thumbnails_ModelId_Format",
                table: "Thumbnails",
                newName: "IX_Thumbnails_FileId_Format");

            migrationBuilder.AddForeignKey(
                name: "FK_Thumbnails_Files_FileId",
                table: "Thumbnails",
                column: "FileId",
                principalTable: "Files",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
