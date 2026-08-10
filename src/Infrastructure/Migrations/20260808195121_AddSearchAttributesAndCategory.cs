using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchAttributesAndCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AnimationCount",
                table: "AssetSearchDocuments",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CategoryId",
                table: "AssetSearchDocuments",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CategoryName",
                table: "AssetSearchDocuments",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasUvs",
                table: "AssetSearchDocuments",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaterialCount",
                table: "AssetSearchDocuments",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "MaxDimension",
                table: "AssetSearchDocuments",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PartCount",
                table: "AssetSearchDocuments",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VertexCount",
                table: "AssetSearchDocuments",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_CategoryId",
                table: "AssetSearchDocuments",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_MaxDimension",
                table: "AssetSearchDocuments",
                column: "MaxDimension");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AssetSearchDocuments_CategoryId",
                table: "AssetSearchDocuments");

            migrationBuilder.DropIndex(
                name: "IX_AssetSearchDocuments_MaxDimension",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "AnimationCount",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "CategoryName",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "HasUvs",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "MaterialCount",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "MaxDimension",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "PartCount",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "VertexCount",
                table: "AssetSearchDocuments");
        }
    }
}
