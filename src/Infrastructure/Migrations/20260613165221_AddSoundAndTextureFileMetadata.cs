using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSoundAndTextureFileMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Format",
                table: "Textures",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Height",
                table: "Textures",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Width",
                table: "Textures",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Channels",
                table: "Sounds",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Format",
                table: "Sounds",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SampleRate",
                table: "Sounds",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Format",
                table: "Textures");

            migrationBuilder.DropColumn(
                name: "Height",
                table: "Textures");

            migrationBuilder.DropColumn(
                name: "Width",
                table: "Textures");

            migrationBuilder.DropColumn(
                name: "Channels",
                table: "Sounds");

            migrationBuilder.DropColumn(
                name: "Format",
                table: "Sounds");

            migrationBuilder.DropColumn(
                name: "SampleRate",
                table: "Sounds");
        }
    }
}
