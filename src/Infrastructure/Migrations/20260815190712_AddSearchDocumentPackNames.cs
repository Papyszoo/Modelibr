using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Adds the denormalised pack names to the search projection, and backfills them for
    /// assets already in packs.
    ///
    /// The backfill matters: pack membership is only projected on re-derive or when a
    /// pack command runs, so without it every asset already in a pack stays unfindable by
    /// its pack name until something happens to touch it - which for a settled library is
    /// never. Mirrors the projection rule exactly: asset-level documents only
    /// (PartPath IS NULL) and Model assets only, since SearchDocumentBuilder projects
    /// packs for models alone today.
    /// </summary>
    public partial class AddSearchDocumentPackNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PackNames",
                table: "AssetSearchDocuments",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            // Ordered so the stored blob is deterministic: a re-run, or a later
            // SetPacksForAssetAsync over the same membership, yields the same string.
            migrationBuilder.Sql("""
                UPDATE "AssetSearchDocuments" d
                SET "PackNames" = sub.names
                FROM (
                    SELECT pm."ModelsId" AS model_id,
                           string_agg(p."Name", ' ' ORDER BY p."Name") AS names
                    FROM "PackModels" pm
                    JOIN "Packs" p ON p."Id" = pm."PacksId"
                    GROUP BY pm."ModelsId"
                ) sub
                WHERE d."AssetType" = 'Model'
                  AND d."PartPath" IS NULL
                  AND d."AssetId" = sub.model_id;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PackNames",
                table: "AssetSearchDocuments");
        }
    }
}
