using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchDocumentRealDimensions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "DimensionX",
                table: "AssetSearchDocuments",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "DimensionY",
                table: "AssetSearchDocuments",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "DimensionZ",
                table: "AssetSearchDocuments",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScaleConvention",
                table: "AssetSearchDocuments",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            // Backfill from the model version's own bounding box, which is written from the
            // pre-normalization size and is therefore real metres for every existing row.
            //
            // Without this the feature would do nothing for anyone who already has a
            // library: the indexed dimensions come from the extraction rollups, and any
            // extraction predating `7f0c7c77` stored the post-normalizeModel thumbnail
            // framing box instead of the asset. On the maintainer's 1762-model library that
            // meant every single model reported a longest axis of exactly 2, so `minSize`
            // and `maxSize` matched nothing at all. Re-extracting is the thorough repair;
            // this makes the size filters honest immediately.
            //
            // Asset-level rows only. A part's size has no equivalent trusted source, so
            // part rows keep whatever the extraction gave them and are repaired by a
            // re-extraction rather than by guessing here.
            migrationBuilder.Sql("""
                UPDATE "AssetSearchDocuments" d
                SET "DimensionX" = NULLIF(v."BoundingBoxX", 0),
                    "DimensionY" = NULLIF(v."BoundingBoxY", 0),
                    "DimensionZ" = NULLIF(v."BoundingBoxZ", 0),
                    "MaxDimension" = NULLIF(GREATEST(v."BoundingBoxX", v."BoundingBoxY", v."BoundingBoxZ"), 0),
                    "ScaleConvention" = CASE
                        WHEN GREATEST(v."BoundingBoxX", v."BoundingBoxY", v."BoundingBoxZ") <= 0 THEN NULL
                        -- Tight epsilon on purpose: an authored 2.19 m sofa must stay
                        -- "authored", and only a longest axis landing on 1 or 2 almost
                        -- exactly is the fingerprint of a bounds-normalising exporter.
                        WHEN abs(GREATEST(v."BoundingBoxX", v."BoundingBoxY", v."BoundingBoxZ") - 1.0) < 0.001
                          OR abs(GREATEST(v."BoundingBoxX", v."BoundingBoxY", v."BoundingBoxZ") - 2.0) < 0.001
                            THEN 'normalized'
                        ELSE 'authored'
                    END
                FROM "ModelVersions" v
                WHERE d."AssetType" = 'Model'
                  AND d."PartPath" IS NULL
                  AND d."VersionId" = v."Id"
                  AND v."BoundingBoxX" IS NOT NULL
                  AND v."BoundingBoxY" IS NOT NULL
                  AND v."BoundingBoxZ" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DimensionX",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "DimensionY",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "DimensionZ",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "ScaleConvention",
                table: "AssetSearchDocuments");
        }
    }
}
