using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddExtractionSubstrate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AgentOperationLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    IdempotencyKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    BatchId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Operation = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AssetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    AssetId = table.Column<int>(type: "integer", nullable: true),
                    PayloadBefore = table.Column<string>(type: "jsonb", nullable: true),
                    PayloadAfter = table.Column<string>(type: "jsonb", nullable: true),
                    PerformedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReversedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgentOperationLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AssetDerivationLineages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AssetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    AssetId = table.Column<int>(type: "integer", nullable: false),
                    SourceAssetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SourceAssetId = table.Column<int>(type: "integer", nullable: false),
                    SourceVersionId = table.Column<int>(type: "integer", nullable: true),
                    SourcePartPath = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetDerivationLineages", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AssetExtractions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AssetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    AssetId = table.Column<int>(type: "integer", nullable: false),
                    VersionId = table.Column<int>(type: "integer", nullable: true),
                    FileSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RawPayload = table.Column<string>(type: "jsonb", nullable: false),
                    ExtractorVersion = table.Column<int>(type: "integer", nullable: false),
                    GeometryHashVersion = table.Column<int>(type: "integer", nullable: true),
                    SchemaVersion = table.Column<int>(type: "integer", nullable: false),
                    Outcome = table.Column<int>(type: "integer", nullable: false),
                    Warnings = table.Column<List<string>>(type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]"),
                    ExtractedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetExtractions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ExtractionJobs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AssetType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    AssetId = table.Column<int>(type: "integer", nullable: false),
                    VersionId = table.Column<int>(type: "integer", nullable: true),
                    FileSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ExtractorFamily = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    MaxAttempts = table.Column<int>(type: "integer", nullable: false),
                    ErrorMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    WarningDetail = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    LockedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LockedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LockTimeoutMinutes = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExtractionJobs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AgentOperationLogs_BatchId",
                table: "AgentOperationLogs",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_AgentOperationLogs_IdempotencyKey",
                table: "AgentOperationLogs",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssetDerivationLineages_AssetType_AssetId",
                table: "AssetDerivationLineages",
                columns: new[] { "AssetType", "AssetId" });

            migrationBuilder.CreateIndex(
                name: "IX_AssetDerivationLineages_SourceAssetType_SourceAssetId",
                table: "AssetDerivationLineages",
                columns: new[] { "SourceAssetType", "SourceAssetId" });

            migrationBuilder.CreateIndex(
                name: "IX_AssetExtractions_AssetType_AssetId_VersionId_FileSha256",
                table: "AssetExtractions",
                columns: new[] { "AssetType", "AssetId", "VersionId", "FileSha256" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.CreateIndex(
                name: "IX_AssetExtractions_AssetType_ExtractorVersion",
                table: "AssetExtractions",
                columns: new[] { "AssetType", "ExtractorVersion" });

            migrationBuilder.CreateIndex(
                name: "IX_ExtractionJobs_AssetType_AssetId_VersionId_ExtractorFamily",
                table: "ExtractionJobs",
                columns: new[] { "AssetType", "AssetId", "VersionId", "ExtractorFamily" },
                unique: true,
                filter: "\"Status\" IN (0, 1)");

            migrationBuilder.CreateIndex(
                name: "IX_ExtractionJobs_ExtractorFamily_Status_CreatedAt",
                table: "ExtractionJobs",
                columns: new[] { "ExtractorFamily", "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AgentOperationLogs");

            migrationBuilder.DropTable(
                name: "AssetDerivationLineages");

            migrationBuilder.DropTable(
                name: "AssetExtractions");

            migrationBuilder.DropTable(
                name: "ExtractionJobs");
        }
    }
}
