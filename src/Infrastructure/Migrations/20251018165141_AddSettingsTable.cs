using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSettingsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Settings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Value = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Settings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Settings_Key",
                table: "Settings",
                column: "Key",
                unique: true);

            // Migrate data from ApplicationSettings to Settings
            migrationBuilder.Sql(@"
                INSERT INTO ""Settings"" (""Key"", ""Value"", ""Description"", ""CreatedAt"", ""UpdatedAt"")
                SELECT 
                    'MaxFileSizeBytes', 
                    CAST(""MaxFileSizeBytes"" AS TEXT),
                    'Maximum file size in bytes (max 10GB)',
                    ""CreatedAt"",
                    ""UpdatedAt""
                FROM ""ApplicationSettings""
                WHERE EXISTS (SELECT 1 FROM ""ApplicationSettings"" LIMIT 1)
                UNION ALL
                SELECT 
                    'MaxThumbnailSizeBytes', 
                    CAST(""MaxThumbnailSizeBytes"" AS TEXT),
                    'Maximum thumbnail size in bytes (max 10MB)',
                    ""CreatedAt"",
                    ""UpdatedAt""
                FROM ""ApplicationSettings""
                WHERE EXISTS (SELECT 1 FROM ""ApplicationSettings"" LIMIT 1)
                UNION ALL
                SELECT 
                    'ThumbnailFrameCount', 
                    CAST(""ThumbnailFrameCount"" AS TEXT),
                    'Number of frames to generate for thumbnail (1-360)',
                    ""CreatedAt"",
                    ""UpdatedAt""
                FROM ""ApplicationSettings""
                WHERE EXISTS (SELECT 1 FROM ""ApplicationSettings"" LIMIT 1)
                UNION ALL
                SELECT 
                    'ThumbnailCameraVerticalAngle', 
                    CAST(""ThumbnailCameraVerticalAngle"" AS TEXT),
                    'Camera vertical angle multiplier for thumbnail (0-2)',
                    ""CreatedAt"",
                    ""UpdatedAt""
                FROM ""ApplicationSettings""
                WHERE EXISTS (SELECT 1 FROM ""ApplicationSettings"" LIMIT 1)
                UNION ALL
                SELECT 
                    'ThumbnailWidth', 
                    CAST(""ThumbnailWidth"" AS TEXT),
                    'Thumbnail width in pixels (64-2048)',
                    ""CreatedAt"",
                    ""UpdatedAt""
                FROM ""ApplicationSettings""
                WHERE EXISTS (SELECT 1 FROM ""ApplicationSettings"" LIMIT 1)
                UNION ALL
                SELECT 
                    'ThumbnailHeight', 
                    CAST(""ThumbnailHeight"" AS TEXT),
                    'Thumbnail height in pixels (64-2048)',
                    ""CreatedAt"",
                    ""UpdatedAt""
                FROM ""ApplicationSettings""
                WHERE EXISTS (SELECT 1 FROM ""ApplicationSettings"" LIMIT 1)
                UNION ALL
                SELECT 
                    'GenerateThumbnailOnUpload', 
                    CASE WHEN ""GenerateThumbnailOnUpload"" THEN 'true' ELSE 'false' END,
                    'Whether to generate thumbnails automatically on upload',
                    ""CreatedAt"",
                    ""UpdatedAt""
                FROM ""ApplicationSettings""
                WHERE EXISTS (SELECT 1 FROM ""ApplicationSettings"" LIMIT 1);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Settings");
        }
    }
}
