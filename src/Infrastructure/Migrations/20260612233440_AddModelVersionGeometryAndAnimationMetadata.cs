using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddModelVersionGeometryAndAnimationMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AnimationCount",
                table: "ModelVersions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<List<string>>(
                name: "AnimationNames",
                table: "ModelVersions",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.AddColumn<int>(
                name: "BoneCount",
                table: "ModelVersions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "BoundingBoxX",
                table: "ModelVersions",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "BoundingBoxY",
                table: "ModelVersions",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "BoundingBoxZ",
                table: "ModelVersions",
                type: "double precision",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AnimationCount",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "AnimationNames",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "BoneCount",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "BoundingBoxX",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "BoundingBoxY",
                table: "ModelVersions");

            migrationBuilder.DropColumn(
                name: "BoundingBoxZ",
                table: "ModelVersions");
        }
    }
}
