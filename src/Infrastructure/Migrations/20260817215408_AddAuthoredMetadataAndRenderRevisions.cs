using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthoredMetadataAndRenderRevisions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SceneRevision",
                table: "ThumbnailJobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RenderedRevision",
                table: "SceneRenders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RequestedRevision",
                table: "SceneRenders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AuthoredTags",
                table: "AssetSearchDocuments",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "AssetSearchDocuments",
                type: "text",
                nullable: false,
                defaultValue: "");

            // Backfill, because the columns are useless empty. Every model already tagged
            // or described would otherwise stay unfindable by those words until someone
            // happened to re-save it - and for a library that has been curated over months,
            // that is most of the value of this change sitting in a table search cannot see.
            //
            // Asset-level rows only, matching how the projection is written: tags belong to
            // the asset, not to its meshes. Tag names are sorted so the stored blob depends
            // only on WHICH tags a model has, exactly as AssetSearchDocument.NormalizeTags
            // does - a backfill that disagreed with the code would persist the same
            // membership as two different strings.
            migrationBuilder.Sql("""
                UPDATE "AssetSearchDocuments" d
                SET "AuthoredTags" = COALESCE(t.names, ''),
                    "Description"  = COALESCE(m."Description", '')
                FROM "Models" m
                LEFT JOIN LATERAL (
                    SELECT string_agg(mt."Name", ' ' ORDER BY mt."Name") AS names
                    FROM "ModelTagAssignments" a
                    JOIN "ModelTags" mt ON mt."Id" = a."ModelTagId"
                    WHERE a."ModelId" = m."Id"
                ) t ON TRUE
                WHERE d."AssetType" = 'Model'
                  AND d."PartPath" IS NULL
                  AND d."AssetId" = m."Id";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SceneRevision",
                table: "ThumbnailJobs");

            migrationBuilder.DropColumn(
                name: "RenderedRevision",
                table: "SceneRenders");

            migrationBuilder.DropColumn(
                name: "RequestedRevision",
                table: "SceneRenders");

            migrationBuilder.DropColumn(
                name: "AuthoredTags",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "AssetSearchDocuments");
        }
    }
}
