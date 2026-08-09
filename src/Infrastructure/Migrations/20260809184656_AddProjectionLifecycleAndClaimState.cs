using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectionLifecycleAndClaimState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AssetSearchDocuments_AssetType_IsCurrentVersion_Prominence",
                table: "AssetSearchDocuments");

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "AssetSearchDocuments",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ClaimedAt",
                table: "AgentOperationLogs",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "ClaimedBy",
                table: "AgentOperationLogs",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedAt",
                table: "AgentOperationLogs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "AgentOperationLogs",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Completed");

            // Backfill: existing log rows predate the claim state machine. They were only
            // ever written around a write that ran, so Completed (the column default) is
            // right for Status; give their claim timestamps the value they would have had.
            migrationBuilder.Sql(
                @"UPDATE ""AgentOperationLogs""
                     SET ""ClaimedAt"" = ""PerformedAt"",
                         ""CompletedAt"" = ""PerformedAt""
                   WHERE ""ClaimedAt"" = '0001-01-01 00:00:00Z';");

            // Backfill: search documents for assets already in the recycle bin must not
            // stay searchable just because they were indexed before this column existed.
            migrationBuilder.Sql(
                @"UPDATE ""AssetSearchDocuments"" d
                     SET ""IsActive"" = false
                    FROM ""Models"" m
                   WHERE d.""AssetType"" = 'Model'
                     AND d.""AssetId"" = m.""Id""
                     AND m.""IsDeleted"" = true;");

            migrationBuilder.Sql(
                @"UPDATE ""AssetSearchDocuments"" d
                     SET ""IsActive"" = false
                    FROM ""ModelVersions"" v
                   WHERE d.""AssetType"" = 'Model'
                     AND d.""VersionId"" = v.""Id""
                     AND v.""IsDeleted"" = true;");

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_AssetType_IsActive_IsCurrentVersion_Pr~",
                table: "AssetSearchDocuments",
                columns: new[] { "AssetType", "IsActive", "IsCurrentVersion", "Prominence" });

            migrationBuilder.CreateIndex(
                name: "IX_AgentOperationLogs_Status_ClaimedAt",
                table: "AgentOperationLogs",
                columns: new[] { "Status", "ClaimedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AssetSearchDocuments_AssetType_IsActive_IsCurrentVersion_Pr~",
                table: "AssetSearchDocuments");

            migrationBuilder.DropIndex(
                name: "IX_AgentOperationLogs_Status_ClaimedAt",
                table: "AgentOperationLogs");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "ClaimedAt",
                table: "AgentOperationLogs");

            migrationBuilder.DropColumn(
                name: "ClaimedBy",
                table: "AgentOperationLogs");

            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "AgentOperationLogs");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "AgentOperationLogs");

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_AssetType_IsCurrentVersion_Prominence",
                table: "AssetSearchDocuments",
                columns: new[] { "AssetType", "IsCurrentVersion", "Prominence" });
        }
    }
}
