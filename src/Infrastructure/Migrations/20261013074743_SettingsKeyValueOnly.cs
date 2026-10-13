using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SettingsKeyValueOnly : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The key-value Settings table becomes the only store of settings.
            // The legacy row's values are written for all seven keys, overwriting
            // a differing key-value entry: verification against the current
            // readers shows they prefer the row whenever it exists (GET /settings,
            // the upload/limit checks and the thumbnail pipeline all read it
            // first), so the row's value is what users actually saw. Copying only
            // missing keys would silently change a setting on upgrade - e.g. the
            // CollapseThumbnailWidthHeightToSize migration seeded a ThumbnailSize
            // of 256 that the row's 512 has outranked on every read since.
            // CreatedAt and UpdatedAt carry the row's times into every core row so
            // the settings API keeps reporting the timestamps users saw.
            //
            // CleanRecycledFilesAfterDays is deliberately not copied. The column
            // was written but never read, and it can still hold the old 30-day
            // default on upgraded installs. Copying that value would turn "never"
            // into an active purge and start deleting recycled items after an
            // upgrade. Absent or 0 means never, now and after the upgrade alike.
            migrationBuilder.Sql(
                """
                INSERT INTO "Settings" ("Key", "Value", "Description", "CreatedAt", "UpdatedAt")
                SELECT v."Key", v."Value", NULL, s."CreatedAt", s."UpdatedAt"
                FROM "ApplicationSettings" s
                CROSS JOIN LATERAL (VALUES
                    ('MaxFileSizeBytes', s."MaxFileSizeBytes"::text),
                    ('MaxThumbnailSizeBytes', s."MaxThumbnailSizeBytes"::text),
                    ('ThumbnailFrameCount', s."ThumbnailFrameCount"::text),
                    ('ThumbnailSize', s."ThumbnailSize"::text),
                    ('GenerateThumbnailOnUpload', CASE WHEN s."GenerateThumbnailOnUpload" THEN 'true' ELSE 'false' END),
                    ('GenerateAnimatedThumbnail', CASE WHEN s."GenerateAnimatedThumbnail" THEN 'true' ELSE 'false' END),
                    ('TextureProxySize', s."TextureProxySize"::text)
                ) AS v("Key", "Value")
                WHERE s."Id" = (SELECT min("Id") FROM "ApplicationSettings")
                ON CONFLICT ("Key") DO UPDATE
                    SET "Value" = EXCLUDED."Value",
                        "CreatedAt" = EXCLUDED."CreatedAt",
                        "UpdatedAt" = EXCLUDED."UpdatedAt";
                """);

            migrationBuilder.DropTable(
                name: "ApplicationSettings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ApplicationSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CleanRecycledFilesAfterDays = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    GenerateAnimatedThumbnail = table.Column<bool>(type: "boolean", nullable: false),
                    GenerateThumbnailOnUpload = table.Column<bool>(type: "boolean", nullable: false),
                    MaxFileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    MaxThumbnailSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    TextureProxySize = table.Column<int>(type: "integer", nullable: false, defaultValue: 512),
                    ThumbnailFrameCount = table.Column<int>(type: "integer", nullable: false),
                    ThumbnailSize = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationSettings", x => x.Id);
                });
        }
    }
}
