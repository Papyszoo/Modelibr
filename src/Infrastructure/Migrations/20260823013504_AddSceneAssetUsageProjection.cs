using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSceneAssetUsageProjection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SceneAssetUsages",
                columns: table => new
                {
                    SceneId = table.Column<int>(type: "integer", nullable: false),
                    NodeId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    AssetType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AssetId = table.Column<int>(type: "integer", nullable: false),
                    VersionId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SceneAssetUsages", x => new { x.SceneId, x.NodeId });
                    table.ForeignKey(
                        name: "FK_SceneAssetUsages_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SceneAssetUsages_AssetType_AssetId",
                table: "SceneAssetUsages",
                columns: new[] { "AssetType", "AssetId" });

            // Backfill from the documents already stored, so the projection answers for the
            // scenes that exist rather than only for the ones written after this migration.
            // From here on the code path owns it: every accepted document rebuilds its scene's
            // rows, so a scene this misses repairs itself the next time it is edited.
            //
            // Nodes carrying no asset contribute nothing - a blockout primitive is not
            // something a project can be said to use - and the numeric guard keeps a
            // hand-edited document from failing the whole migration on one bad cast.
            migrationBuilder.Sql(@"
                INSERT INTO ""SceneAssetUsages"" (""SceneId"", ""NodeId"", ""AssetType"", ""AssetId"", ""VersionId"")
                SELECT s.""Id"",
                       n->>'id',
                       n->'asset'->>'assetType',
                       (n->'asset'->>'assetId')::int,
                       NULLIF(n->'asset'->>'versionId', '')::int
                FROM ""Scenes"" s
                CROSS JOIN LATERAL jsonb_array_elements(s.""DocumentJson""::jsonb -> 'nodes') AS n
                WHERE jsonb_typeof(s.""DocumentJson""::jsonb -> 'nodes') = 'array'
                  AND jsonb_typeof(n->'asset') = 'object'
                  AND n->>'id' IS NOT NULL
                  AND n->'asset'->>'assetType' IS NOT NULL
                  AND n->'asset'->>'assetId' ~ '^[0-9]+$'
                ON CONFLICT DO NOTHING;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SceneAssetUsages");
        }
    }
}
