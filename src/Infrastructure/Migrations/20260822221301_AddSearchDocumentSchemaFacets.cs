using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchDocumentSchemaFacets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "License",
                table: "AssetSearchDocuments",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<List<string>>(
                name: "Styles",
                table: "AssetSearchDocuments",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.AddColumn<List<string>>(
                name: "Themes",
                table: "AssetSearchDocuments",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_License",
                table: "AssetSearchDocuments",
                column: "License");

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_Styles",
                table: "AssetSearchDocuments",
                column: "Styles")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "IX_AssetSearchDocuments_Themes",
                table: "AssetSearchDocuments",
                column: "Themes")
                .Annotation("Npgsql:IndexMethod", "gin");

            // Backfill (prompt 16-F). The library already says "low poly" and "sci-fi" -
            // it says it in tags, where nothing can filter on it. This lifts the ones that
            // are unambiguously a style or a theme onto the typed facets, for the whole
            // library, without re-extracting anything.
            //
            // The vocabulary is written out here rather than read from
            // AssetMetadataSchema on purpose: a migration must keep meaning what it meant
            // the day it ran, and a later edit to that list must not silently change what
            // this already did.
            //
            // Tags are NOT removed. A tag is what a person wrote; the facet is a reading
            // of it, and the two can coexist - deleting the tag would destroy the evidence
            // and break anyone searching by the word they used.
            migrationBuilder.Sql(@"
                WITH vocab(kind, val, pattern) AS (
                    VALUES
                        ('style', 'Low Poly',       'low[ _-]?poly'),
                        ('style', 'Realistic',      'realistic|photoreal(istic)?'),
                        ('style', 'Stylized',       'stylized|stylised'),
                        ('style', 'Voxel',          'voxel'),
                        ('style', 'Pixel Art',      'pixel[ _-]?art'),
                        ('style', 'Hand Painted',   'hand[ _-]?painted'),
                        ('style', 'Toon',           'toon|cel[ _-]?shaded'),
                        ('style', 'Photogrammetry', 'photogrammetry|scanned'),
                        ('style', 'Minimalist',     'minimalist|minimal'),
                        ('theme', 'Sci-Fi',         'sci[ _-]?fi|science[ _-]?fiction'),
                        ('theme', 'Fantasy',        'fantasy'),
                        ('theme', 'Medieval',       'medieval'),
                        ('theme', 'Modern',         'modern'),
                        ('theme', 'Horror',         'horror'),
                        ('theme', 'Military',       'military'),
                        ('theme', 'Industrial',     'industrial'),
                        ('theme', 'Urban',          'urban|city'),
                        ('theme', 'Nature',         'nature'),
                        ('theme', 'Space',          'space'),
                        ('theme', 'Underwater',     'underwater'),
                        ('theme', 'Western',        'western'),
                        ('theme', 'Cyberpunk',      'cyberpunk'),
                        ('theme', 'Steampunk',      'steampunk'),
                        ('theme', 'Post-Apocalyptic', 'post[ _-]?apocalyptic|apocalyptic')
                ),
                matched AS (
                    SELECT a.""ModelId"" AS asset_id, v.kind, v.val
                    FROM ""ModelTagAssignments"" a
                    JOIN ""ModelTags"" t ON t.""Id"" = a.""ModelTagId""
                    -- Whole-tag match only. A tag has to BE the word, not contain it:
                    -- 'space' is a theme, 'spaceship_hull_02' is a name.
                    JOIN vocab v ON lower(btrim(t.""Name"")) ~ ('^(' || v.pattern || ')$')
                    GROUP BY a.""ModelId"", v.kind, v.val
                ),
                agg AS (
                    SELECT asset_id,
                           array_agg(DISTINCT val) FILTER (WHERE kind = 'style') AS styles,
                           array_agg(DISTINCT val) FILTER (WHERE kind = 'theme') AS themes
                    FROM matched
                    GROUP BY asset_id
                )
                INSERT INTO ""AssetMetadata""
                    (""AssetType"", ""AssetId"", ""SchemaVersion"", ""Tags"", ""Styles"", ""Themes"", ""CreatedAt"", ""UpdatedAt"")
                SELECT 'Model', asset_id, 1, '{}'::text[],
                       coalesce(styles, '{}'::text[]), coalesce(themes, '{}'::text[]),
                       now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'
                FROM agg
                ON CONFLICT (""AssetType"", ""AssetId"") DO UPDATE SET
                    -- Only where nothing was set: a row that already carries styles was
                    -- written by a person or an import, and a guess from tags must not
                    -- overrule it.
                    ""Styles"" = CASE WHEN ""AssetMetadata"".""Styles"" = '{}'::text[]
                                    THEN EXCLUDED.""Styles"" ELSE ""AssetMetadata"".""Styles"" END,
                    ""Themes"" = CASE WHEN ""AssetMetadata"".""Themes"" = '{}'::text[]
                                    THEN EXCLUDED.""Themes"" ELSE ""AssetMetadata"".""Themes"" END,
                    ""UpdatedAt"" = now() AT TIME ZONE 'UTC';
            ");

            // Then mirror every metadata row onto the projection - both the rows this
            // migration just wrote and any a store import created before the projection
            // had columns to hold them. Asset-level documents only: a facet describes the
            // asset, not one of its meshes.
            migrationBuilder.Sql(@"
                UPDATE ""AssetSearchDocuments"" d
                SET ""Styles"" = m.""Styles"",
                    ""Themes"" = m.""Themes"",
                    ""License"" = m.""License""
                FROM ""AssetMetadata"" m
                WHERE m.""AssetType"" = d.""AssetType""
                  AND m.""AssetId"" = d.""AssetId""
                  AND d.""PartPath"" IS NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AssetSearchDocuments_License",
                table: "AssetSearchDocuments");

            migrationBuilder.DropIndex(
                name: "IX_AssetSearchDocuments_Styles",
                table: "AssetSearchDocuments");

            migrationBuilder.DropIndex(
                name: "IX_AssetSearchDocuments_Themes",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "License",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "Styles",
                table: "AssetSearchDocuments");

            migrationBuilder.DropColumn(
                name: "Themes",
                table: "AssetSearchDocuments");
        }
    }
}
