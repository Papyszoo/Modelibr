using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddImportAutomationAndFolderCapture : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FolderTokens",
                table: "AssetSearchDocuments",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "AutoAppliedAt",
                table: "AssetMetadata",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AutoCategoryId",
                table: "AssetMetadata",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "AutoReviewedAt",
                table: "AssetMetadata",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string[]>(
                name: "AutoTags",
                table: "AssetMetadata",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.AddColumn<string>(
                name: "SourceFolder",
                table: "AssetMetadata",
                type: "character varying(1024)",
                maxLength: 1024,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssetMetadata_AssetType_AutoAppliedAt_AutoReviewedAt",
                table: "AssetMetadata",
                columns: new[] { "AssetType", "AutoAppliedAt", "AutoReviewedAt" },
                filter: "\"AutoAppliedAt\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AssetMetadata_AssetType_AutoAppliedAt_AutoReviewedAt",
                table: "AssetMetadata");

            migrationBuilder.DropColumn(
                name: "FolderTokens",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "AutoAppliedAt",
                table: "AssetMetadata");

            migrationBuilder.DropColumn(
                name: "AutoCategoryId",
                table: "AssetMetadata");

            migrationBuilder.DropColumn(
                name: "AutoReviewedAt",
                table: "AssetMetadata");

            migrationBuilder.DropColumn(
                name: "AutoTags",
                table: "AssetMetadata");

            migrationBuilder.DropColumn(
                name: "SourceFolder",
                table: "AssetMetadata");
        }
    }
}
