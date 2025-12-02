using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSoftDeleteSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "TextureSets",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "TextureSets",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Textures",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Textures",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "ModelVersions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "ModelVersions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Models",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Models",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Files",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Files",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "CleanRecycledFilesAfterDays",
                table: "ApplicationSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_TextureSets_IsDeleted",
                table: "TextureSets",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_Textures_IsDeleted",
                table: "Textures",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_ModelVersions_IsDeleted",
                table: "ModelVersions",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_Models_IsDeleted",
                table: "Models",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_Files_IsDeleted",
                table: "Files",
                column: "IsDeleted");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TextureSets_IsDeleted",
                table: "TextureSets");

            migrationBuilder.DropIndex(
                name: "IX_Textures_IsDeleted",
                table: "Textures");

            migrationBuilder.DropIndex(
                name: "IX_ModelVersions_IsDeleted",
                table: "ModelVersions");

            migrationBuilder.DropIndex(
                name: "IX_Models_IsDeleted",
                table: "Models");

            migrationBuilder.DropIndex(
                name: "IX_Files_IsDeleted",
                table: "Files");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "TextureSets");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "TextureSets");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Textures");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Textures");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Models");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Models");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Files");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Files");

            migrationBuilder.DropColumn(
                name: "CleanRecycledFilesAfterDays",
                table: "ApplicationSettings");
        }
    }
}
