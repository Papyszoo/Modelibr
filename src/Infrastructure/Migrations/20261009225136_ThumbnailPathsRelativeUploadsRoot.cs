using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Rewrites every persisted thumbnail / preview path from an absolute path to
    /// the uploads-root-relative form every other stored file uses. See
    /// <see cref="ThumbnailPathNormalizer"/> for the exact, idempotent SQL.
    /// </summary>
    public partial class ThumbnailPathsRelativeUploadsRoot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            foreach (var statement in ThumbnailPathNormalizer.Statements())
            {
                migrationBuilder.Sql(statement);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Irreversible by design: the stripped prefix was a machine-specific
            // uploads root that the relative form intentionally no longer carries.
            // Leaving the paths relative is harmless - every reader can still open
            // them - so Down is a no-op rather than a guess at the old root.
        }
    }
}
