using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAssetParts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AssetParts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AssetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    AssetId = table.Column<int>(type: "integer", nullable: false),
                    VersionId = table.Column<int>(type: "integer", nullable: true),
                    PartPath = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    Name = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    ParentPath = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    Depth = table.Column<int>(type: "integer", nullable: false),
                    ObjectType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    TriangleCount = table.Column<int>(type: "integer", nullable: true),
                    VertexCount = table.Column<int>(type: "integer", nullable: true),
                    GeometryHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    GeometryHashVersion = table.Column<int>(type: "integer", nullable: true),
                    HasUvs = table.Column<bool>(type: "boolean", nullable: true),
                    Detail = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetParts", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssetParts_AssetType_AssetId_VersionId",
                table: "AssetParts",
                columns: new[] { "AssetType", "AssetId", "VersionId" });

            migrationBuilder.CreateIndex(
                name: "IX_AssetParts_AssetType_AssetId_VersionId_PartPath",
                table: "AssetParts",
                columns: new[] { "AssetType", "AssetId", "VersionId", "PartPath" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.CreateIndex(
                name: "IX_AssetParts_GeometryHash",
                table: "AssetParts",
                column: "GeometryHash");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AssetParts");
        }
    }
}
