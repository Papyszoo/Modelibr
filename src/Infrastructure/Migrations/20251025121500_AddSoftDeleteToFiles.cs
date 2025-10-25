using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSoftDeleteToFiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Add Deleted column to Files table
            migrationBuilder.AddColumn<bool>(
                name: "Deleted",
                table: "Files",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Add FileId column to RecycledFiles table
            migrationBuilder.AddColumn<int>(
                name: "FileId",
                table: "RecycledFiles",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Create index on RecycledFiles.FileId
            migrationBuilder.CreateIndex(
                name: "IX_RecycledFiles_FileId",
                table: "RecycledFiles",
                column: "FileId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Remove index on RecycledFiles.FileId
            migrationBuilder.DropIndex(
                name: "IX_RecycledFiles_FileId",
                table: "RecycledFiles");

            // Remove FileId column from RecycledFiles table
            migrationBuilder.DropColumn(
                name: "FileId",
                table: "RecycledFiles");

            // Remove Deleted column from Files table
            migrationBuilder.DropColumn(
                name: "Deleted",
                table: "Files");
        }
    }
}
