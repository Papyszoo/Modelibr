using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UniquePackStoreProvenance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Packs_StoreImportUrl_StoreImportAssetId",
                table: "Packs");

            // The old non-unique index allowed duplicate provenance stamps, so a database that
            // ran the two-commit importer may already hold them and would fail the index
            // creation below. Keep the OLDEST pack for each store asset stamped and clear the
            // stamp on the rest - no pack and no imported asset is deleted; the un-stamped
            // duplicates simply stop being re-import targets and can be merged or removed by
            // hand.
            migrationBuilder.Sql("""
                UPDATE "Packs" AS p
                SET "StoreImportUrl" = NULL,
                    "StoreImportAssetId" = NULL,
                    "StoreImportManifestVersion" = NULL,
                    "StoreImportedAt" = NULL
                WHERE p."StoreImportUrl" IS NOT NULL
                  AND p."Id" > (
                      SELECT MIN(q."Id") FROM "Packs" AS q
                      WHERE q."StoreImportUrl" = p."StoreImportUrl"
                        AND q."StoreImportAssetId" IS NOT DISTINCT FROM p."StoreImportAssetId"
                  );
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Packs_StoreImportUrl_StoreImportAssetId",
                table: "Packs",
                columns: new[] { "StoreImportUrl", "StoreImportAssetId" },
                unique: true,
                filter: "\"StoreImportUrl\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Packs_StoreImportUrl_StoreImportAssetId",
                table: "Packs");

            migrationBuilder.CreateIndex(
                name: "IX_Packs_StoreImportUrl_StoreImportAssetId",
                table: "Packs",
                columns: new[] { "StoreImportUrl", "StoreImportAssetId" });
        }
    }
}
