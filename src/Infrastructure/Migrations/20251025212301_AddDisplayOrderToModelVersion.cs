using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDisplayOrderToModelVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "ModelVersions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Set DisplayOrder to match VersionNumber for existing records
            migrationBuilder.Sql(
                "UPDATE \"ModelVersions\" SET \"DisplayOrder\" = \"VersionNumber\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "ModelVersions");
        }
    }
}
