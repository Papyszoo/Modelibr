using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStoreImports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "StoreImportAssetId",
                table: "Packs",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StoreImportManifestVersion",
                table: "Packs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StoreImportUrl",
                table: "Packs",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StoreImportedAt",
                table: "Packs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "StoreImportJobs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    StoreUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    StoreAssetId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ManifestSchemaVersion = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PackId = table.Column<int>(type: "integer", nullable: true),
                    ItemsTotal = table.Column<int>(type: "integer", nullable: false),
                    ItemsCreated = table.Column<int>(type: "integer", nullable: false),
                    ItemsSkipped = table.Column<int>(type: "integer", nullable: false),
                    ItemsFailed = table.Column<int>(type: "integer", nullable: false),
                    ResultJson = table.Column<string>(type: "text", nullable: true),
                    ErrorMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreImportJobs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Packs_StoreImportUrl_StoreImportAssetId",
                table: "Packs",
                columns: new[] { "StoreImportUrl", "StoreImportAssetId" });

            migrationBuilder.CreateIndex(
                name: "IX_StoreImportJobs_Status",
                table: "StoreImportJobs",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_StoreImportJobs_StoreUrl_StoreAssetId",
                table: "StoreImportJobs",
                columns: new[] { "StoreUrl", "StoreAssetId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StoreImportJobs");

            migrationBuilder.DropIndex(
                name: "IX_Packs_StoreImportUrl_StoreImportAssetId",
                table: "Packs");

            migrationBuilder.DropColumn(
                name: "StoreImportAssetId",
                table: "Packs");

            migrationBuilder.DropColumn(
                name: "StoreImportManifestVersion",
                table: "Packs");

            migrationBuilder.DropColumn(
                name: "StoreImportUrl",
                table: "Packs");

            migrationBuilder.DropColumn(
                name: "StoreImportedAt",
                table: "Packs");
        }
    }
}
