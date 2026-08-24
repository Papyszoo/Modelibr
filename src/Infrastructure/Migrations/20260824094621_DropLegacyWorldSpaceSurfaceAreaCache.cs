using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Clears the <c>surface-area</c> rows written before the metric declared which space it
    /// was measured in.
    ///
    /// <para>
    /// The compute cache is keyed by a geometry hash computed from <b>local</b> vertex
    /// coordinates, so two instances of one mesh at 1x and at 100x hash identically. The
    /// worker cached the <b>world</b>-space area under that key - a number that depends on
    /// the object's transform - so one instance's surface was served to the other as fact,
    /// silently and permanently. A mesh scaled 100x has 10,000x the area; nothing about the
    /// answer looked wrong.
    /// </para>
    ///
    /// <para>
    /// There is no conversion back: the row records an area and nothing about which
    /// instance produced it. So the legacy rows go, and the next <c>analyze_meshes</c> run
    /// writes a local-space one in their place. Deleting a cache entry costs a recompute
    /// and nothing else - no asset, derivation or search document references these rows.
    /// </para>
    ///
    /// <para>
    /// The reader refuses unmarked rows too (see <c>GetComputeResultQueryHandler</c>), which
    /// is the part that matters while an older worker is still running and still writing
    /// them. This migration is the cleanup; that check is the guarantee.
    /// </para>
    /// </summary>
    public partial class DropLegacyWorldSpaceSurfaceAreaCache : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DELETE FROM "ComputeCacheEntries"
                WHERE "Metric" = 'surface-area'
                  AND COALESCE("Result" ->> 'space', '') <> 'local';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Nothing to restore - the rows held numbers that could not be attributed to an
            // instance, which is why they were deleted rather than converted. An older build
            // simply finds the cache cold and recomputes.
        }
    }
}
