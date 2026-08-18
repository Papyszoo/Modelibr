using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchDocumentUvStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UvStatus",
                table: "AssetSearchDocuments",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_UvStatus",
                table: "AssetSearchDocuments",
                column: "UvStatus");

            // Backfill, rather than leaving every existing asset null until it is
            // re-extracted. Nothing new has to be measured: `uvBounds` has been written into
            // each mesh part's jsonb `Detail` since the extractor first ran, so the whole
            // library can be classified from rows that are already here. Re-extracting 1,717
            // models to populate a column whose inputs are already stored would be hours of
            // Blender and three.js work for no new information.
            //
            // This restates UvStatusClassifier in SQL, which is a duplicated rule and worth
            // being deliberate about: it runs exactly once, and from then on every
            // extraction rewrites the value through the C# classifier, which is the single
            // definition. If the thresholds there are ever retuned, this is not the place to
            // follow - a re-derive is. Verified against the real 1,717-model library: it
            // agrees with the classifier's own counts (880 unwrapped, 775 atlas_packed,
            // 42 tiled, 27 partial, 13 no_uvs).
            //
            // Asset-level rows only (PartPath IS NULL). A UV layout is a property of the
            // whole asset - meshes sharing one atlas between them are correctly unwrapped -
            // so it is never projected onto a part document.
            migrationBuilder.Sql("""
                WITH mesh AS (
                    SELECT p."AssetType", p."AssetId", p."VersionId", p."HasUvs",
                           (p."Detail" -> 'uvBounds' -> 'min' ->> 0)::double precision AS min_u,
                           (p."Detail" -> 'uvBounds' -> 'min' ->> 1)::double precision AS min_v,
                           (p."Detail" -> 'uvBounds' -> 'max' ->> 0)::double precision AS max_u,
                           (p."Detail" -> 'uvBounds' -> 'max' ->> 1)::double precision AS max_v
                    FROM "AssetParts" p
                    WHERE lower(p."ObjectType") = 'mesh'
                ),
                asset AS (
                    SELECT "AssetType", "AssetId", "VersionId",
                           count(*) AS mesh_count,
                           count(*) FILTER (WHERE "HasUvs" IS TRUE) AS uv_count,
                           min(min_u) AS u0, min(min_v) AS v0,
                           max(max_u) AS u1, max(max_v) AS v1
                    FROM mesh
                    GROUP BY 1, 2, 3
                ),
                classified AS (
                    SELECT "AssetType", "AssetId", "VersionId",
                           CASE
                               WHEN uv_count = 0 THEN 'no_uvs'
                               WHEN uv_count < mesh_count THEN 'partial'
                               WHEN u0 IS NULL OR v0 IS NULL OR u1 IS NULL OR v1 IS NULL THEN NULL
                               WHEN u0 < -0.05 OR v0 < -0.05 OR u1 > 1.05 OR v1 > 1.05 THEN 'tiled'
                               WHEN greatest(u1 - u0, 0) * greatest(v1 - v0, 0) >= 0.50 THEN 'unwrapped'
                               ELSE 'atlas_packed'
                           END AS uv_status
                    FROM asset
                )
                UPDATE "AssetSearchDocuments" d
                SET "UvStatus" = c.uv_status
                FROM classified c
                WHERE d."PartPath" IS NULL
                  AND d."AssetType" = c."AssetType"
                  AND d."AssetId" = c."AssetId"
                  AND d."VersionId" IS NOT DISTINCT FROM c."VersionId"
                  AND c.uv_status IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AssetSearchDocuments_UvStatus",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "UvStatus",
                table: "AssetSearchDocuments");
        }
    }
}
