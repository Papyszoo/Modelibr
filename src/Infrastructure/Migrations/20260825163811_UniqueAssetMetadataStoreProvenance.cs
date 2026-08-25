using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UniqueAssetMetadataStoreProvenance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AssetMetadata_StoreItemId",
                table: "AssetMetadata");

            migrationBuilder.Sql("""
                UPDATE "AssetMetadata" AS a
                SET "StoreUrl" = NULL,
                    "StoreAssetId" = NULL,
                    "StoreItemId" = NULL,
                    "ImportedAt" = NULL
                WHERE a."StoreUrl" IS NOT NULL
                  AND a."StoreAssetId" IS NOT NULL
                  AND a."StoreItemId" IS NOT NULL
                  AND a."Id" > (
                      SELECT MIN(b."Id") FROM "AssetMetadata" AS b
                      WHERE b."StoreUrl" = a."StoreUrl"
                        AND b."StoreAssetId" = a."StoreAssetId"
                        AND b."StoreItemId" = a."StoreItemId"
                  );
                """);

            migrationBuilder.CreateIndex(
                name: "IX_AssetMetadata_StoreUrl_StoreAssetId_StoreItemId",
                table: "AssetMetadata",
                columns: new[] { "StoreUrl", "StoreAssetId", "StoreItemId" },
                unique: true,
                filter: "\"StoreUrl\" IS NOT NULL AND \"StoreAssetId\" IS NOT NULL AND \"StoreItemId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AssetMetadata_StoreUrl_StoreAssetId_StoreItemId",
                table: "AssetMetadata");

            migrationBuilder.CreateIndex(
                name: "IX_AssetMetadata_StoreItemId",
                table: "AssetMetadata",
                column: "StoreItemId");
        }
    }
}
