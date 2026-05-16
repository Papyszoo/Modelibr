using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveThumbnailCameraVerticalAngle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ThumbnailCameraVerticalAngle",
                table: "ApplicationSettings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "ThumbnailCameraVerticalAngle",
                table: "ApplicationSettings",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);
        }
    }
}
