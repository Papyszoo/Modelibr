using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchDocumentGeometryKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GeometryKey",
                table: "AssetSearchDocuments",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_GeometryKey",
                table: "AssetSearchDocuments",
                column: "GeometryKey");

            // Backfilled here rather than left null until re-extraction, for the same reason
            // UvStatus was: the inputs are already stored. Every part's order-invariant
            // GeometryHash has been written by the extractor since it first ran, so the whole
            // library can be fingerprinted from rows that are already here.
            //
            // This restates SearchDocumentBuilder.GeometryKeyOf in SQL - a duplicated rule,
            // and worth being deliberate about. It runs exactly once; from then on every
            // extraction and every reindex_search rewrites the value through the C# version,
            // which is the single definition. The two are pinned to each other by a golden
            // vector in SearchDocumentBuilderTests, so changing one without the other fails a
            // test rather than silently splitting the library into assets fingerprinted two
            // different ways.
            //
            // The steps match that method exactly: DISTINCT hashes, ordered under the C
            // collation (ordinal, matching StringComparer.Ordinal - the values are lowercase
            // hex either way, but saying so removes the dependency on the database's
            // collation), joined with newlines, hashed as UTF-8 bytes, lowercase hex out.
            //
            // Asset-level rows only (PartPath IS NULL): a part is not a duplicate of an
            // asset, and a part already carries its own hash.
            migrationBuilder.Sql("""
                WITH part_hash AS (
                    SELECT DISTINCT
                           "AssetType", "AssetId", "VersionId", btrim("GeometryHash") AS h
                    FROM "AssetParts"
                    WHERE "GeometryHash" IS NOT NULL
                      AND btrim("GeometryHash") <> ''
                ),
                fingerprint AS (
                    SELECT "AssetType", "AssetId", "VersionId",
                           encode(
                               sha256(convert_to(string_agg(h, E'\n' ORDER BY h COLLATE "C"), 'UTF8')),
                               'hex') AS geometry_key
                    FROM part_hash
                    GROUP BY 1, 2, 3
                )
                UPDATE "AssetSearchDocuments" d
                SET "GeometryKey" = f.geometry_key
                FROM fingerprint f
                WHERE d."PartPath" IS NULL
                  AND d."AssetType" = f."AssetType"
                  AND d."AssetId" = f."AssetId"
                  AND d."VersionId" IS NOT DISTINCT FROM f."VersionId";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AssetSearchDocuments_GeometryKey",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "GeometryKey",
                table: "AssetSearchDocuments");
        }
    }
}
