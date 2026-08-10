using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchProjectionAndLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,");

            migrationBuilder.CreateTable(
                name: "AssetSearchDocuments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AssetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    AssetId = table.Column<int>(type: "integer", nullable: false),
                    VersionId = table.Column<int>(type: "integer", nullable: true),
                    PartPath = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    IsCurrentVersion = table.Column<bool>(type: "boolean", nullable: false),
                    Prominence = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Tokens = table.Column<string>(type: "text", nullable: false),
                    Symbols = table.Column<string>(type: "text", nullable: false),
                    BrowseSummary = table.Column<string>(type: "text", nullable: false),
                    TriangleCount = table.Column<int>(type: "integer", nullable: true),
                    HasAnimations = table.Column<bool>(type: "boolean", nullable: true),
                    BoneCount = table.Column<int>(type: "integer", nullable: true),
                    ShapeClass = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    Tileability = table.Column<double>(type: "double precision", nullable: true),
                    DurationClass = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    Engine = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    GridSize = table.Column<double>(type: "double precision", nullable: true),
                    QualityFlags = table.Column<List<string>>(type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetSearchDocuments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SearchLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Query = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    FiltersJson = table.Column<string>(type: "jsonb", nullable: true),
                    ResultsJson = table.Column<string>(type: "jsonb", nullable: false),
                    ResultCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OpenedAssetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    OpenedAssetId = table.Column<int>(type: "integer", nullable: true),
                    OpenedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SearchLogs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_AssetType_AssetId_VersionId_PartPath",
                table: "AssetSearchDocuments",
                columns: new[] { "AssetType", "AssetId", "VersionId", "PartPath" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_AssetType_IsCurrentVersion_Prominence",
                table: "AssetSearchDocuments",
                columns: new[] { "AssetType", "IsCurrentVersion", "Prominence" });

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_DisplayName",
                table: "AssetSearchDocuments",
                column: "DisplayName")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_Engine",
                table: "AssetSearchDocuments",
                column: "Engine");

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_ShapeClass",
                table: "AssetSearchDocuments",
                column: "ShapeClass");

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_Symbols",
                table: "AssetSearchDocuments",
                column: "Symbols")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_Tokens",
                table: "AssetSearchDocuments",
                column: "Tokens")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_TriangleCount",
                table: "AssetSearchDocuments",
                column: "TriangleCount");

            migrationBuilder.CreateIndex(
                name: "IX_SearchLogs_CreatedAt",
                table: "SearchLogs",
                column: "CreatedAt");

            // Full-text GIN index over the browse-summary prose. The 'simple'
            // config keeps every language's words (no stemming), matching the
            // to_tsvector('simple', "BrowseSummary") the search query builds.
            migrationBuilder.Sql(
                "CREATE INDEX \"IX_AssetSearchDocuments_BrowseSummary_FTS\" " +
                "ON \"AssetSearchDocuments\" USING GIN (to_tsvector('simple', \"BrowseSummary\"));");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_AssetSearchDocuments_BrowseSummary_FTS\";");

            migrationBuilder.DropTable(
                name: "AssetSearchDocuments");

            migrationBuilder.DropTable(
                name: "SearchLogs");

            migrationBuilder.AlterDatabase()
                .OldAnnotation("Npgsql:PostgresExtension:pg_trgm", ",,");
        }
    }
}
