using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MaterialVariants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_ModelVersionTextureSets",
                table: "ModelVersionTextureSets");

            migrationBuilder.AddColumn<string>(
                name: "VariantName",
                table: "ModelVersionTextureSets",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "MainVariantName",
                table: "ModelVersions",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_ModelVersionTextureSets",
                table: "ModelVersionTextureSets",
                columns: new[] { "ModelVersionId", "TextureSetId", "MaterialName", "VariantName" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_ModelVersionTextureSets",
                table: "ModelVersionTextureSets");

            migrationBuilder.DropColumn(
                name: "VariantName",
                table: "ModelVersionTextureSets");

            migrationBuilder.DropColumn(
                name: "MainVariantName",
                table: "ModelVersions");

            migrationBuilder.AddPrimaryKey(
                name: "PK_ModelVersionTextureSets",
                table: "ModelVersionTextureSets",
                columns: new[] { "ModelVersionId", "TextureSetId", "MaterialName" });
        }
    }
}
