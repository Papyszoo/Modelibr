using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAssetMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AssetMetadata",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AssetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    AssetId = table.Column<int>(type: "integer", nullable: false),
                    SchemaVersion = table.Column<int>(type: "integer", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Tags = table.Column<string[]>(type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]"),
                    Styles = table.Column<string[]>(type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]"),
                    Themes = table.Column<string[]>(type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]"),
                    License = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    LicenseName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    LicenseUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    Author = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreditName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreditUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    AttributionRequired = table.Column<bool>(type: "boolean", nullable: true),
                    SourceKind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    SourceUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    StoreUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    StoreAssetId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    StoreItemId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ImportedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FacetsJson = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetMetadata", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssetMetadata_AssetType_AssetId",
                table: "AssetMetadata",
                columns: new[] { "AssetType", "AssetId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssetMetadata_StoreItemId",
                table: "AssetMetadata",
                column: "StoreItemId");

            migrationBuilder.CreateIndex(
                name: "IX_AssetMetadata_StoreUrl_StoreAssetId",
                table: "AssetMetadata",
                columns: new[] { "StoreUrl", "StoreAssetId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AssetMetadata");
        }
    }
}
