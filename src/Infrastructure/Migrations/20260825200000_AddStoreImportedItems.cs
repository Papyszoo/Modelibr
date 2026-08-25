using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStoreImportedItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Some prerelease databases applied the superseded draft migration before it
            // was consolidated into this one. Removing a migration file does not remove
            // its database objects, so make the upgrade path converge explicitly.
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_AssetMetadata_StoreUrl_StoreAssetId_StoreItemId\";");

            migrationBuilder.CreateTable(
                name: "StoreImportedItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    StoreUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    StoreAssetId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    StoreItemId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    AssetType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AssetId = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreImportedItems", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StoreImportedItems_AssetType_AssetId",
                table: "StoreImportedItems",
                columns: new[] { "AssetType", "AssetId" });

            migrationBuilder.CreateIndex(
                name: "IX_StoreImportedItems_StoreUrl_StoreAssetId_StoreItemId",
                table: "StoreImportedItems",
                columns: new[] { "StoreUrl", "StoreAssetId", "StoreItemId" },
                unique: true);

            migrationBuilder.Sql(@"
CREATE OR REPLACE FUNCTION canonicalize_store_url(url text) RETURNS text AS $$
DECLARE
    trimmed text;
    scheme_end int;
    scheme text;
    rest text;
    host_port text;
    host text;
    port text;
    path text;
    slash_pos int;
    colon_pos int;
BEGIN
    IF url IS NULL OR TRIM(url) = '' THEN
        RETURN '';
    END IF;
    trimmed := TRIM(url);
    scheme_end := POSITION('://' IN trimmed);
    IF scheme_end = 0 THEN
        RETURN RTRIM(trimmed, '/');
    END IF;
    scheme := LOWER(SUBSTRING(trimmed FROM 1 FOR scheme_end - 1));
    rest := SUBSTRING(trimmed FROM scheme_end + 3);
    slash_pos := POSITION('/' IN rest);
    IF slash_pos > 0 THEN
        host_port := SUBSTRING(rest FROM 1 FOR slash_pos - 1);
        path := RTRIM(SUBSTRING(rest FROM slash_pos), '/');
    ELSE
        host_port := rest;
        path := '';
    END IF;
    IF SUBSTRING(host_port FROM 1 FOR 1) = '[' THEN
        colon_pos := POSITION(']' IN host_port);
        IF colon_pos > 0 THEN
            host := LOWER(SUBSTRING(host_port FROM 1 FOR colon_pos));
            port := SUBSTRING(host_port FROM colon_pos + 1);
            IF (scheme = 'http' AND port = ':80') OR (scheme = 'https' AND port = ':443') THEN
                port := '';
            END IF;
        ELSE
            host := LOWER(host_port);
            port := '';
        END IF;
    ELSE
        colon_pos := POSITION(':' IN host_port);
        IF colon_pos > 0 THEN
            host := LOWER(SUBSTRING(host_port FROM 1 FOR colon_pos - 1));
            port := SUBSTRING(host_port FROM colon_pos);
            IF (scheme = 'http' AND port = ':80') OR (scheme = 'https' AND port = ':443') THEN
                port := '';
            END IF;
        ELSE
            host := LOWER(host_port);
            port := '';
        END IF;
    END IF;
    RETURN scheme || '://' || host || port || path;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Legacy builds accepted URL components that current imports reject. Canonicalizing
-- those rows would create provenance keys the application can never look up again, so
-- stop with a repairable error instead of silently rewriting them.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM ""Packs""
        WHERE ""StoreImportUrl"" IS NOT NULL AND TRIM(""StoreImportUrl"") <> ''
          AND (
              TRIM(""StoreImportUrl"") !~* '^https?://'
              OR TRIM(""StoreImportUrl"") ~ '[?#]'
              OR SPLIT_PART(SPLIT_PART(TRIM(""StoreImportUrl""), '://', 2), '/', 1) LIKE '%@%'
          )
    ) OR EXISTS (
        SELECT 1 FROM ""AssetMetadata""
        WHERE ""StoreUrl"" IS NOT NULL AND TRIM(""StoreUrl"") <> ''
          AND (
              TRIM(""StoreUrl"") !~* '^https?://'
              OR TRIM(""StoreUrl"") ~ '[?#]'
              OR SPLIT_PART(SPLIT_PART(TRIM(""StoreUrl""), '://', 2), '/', 1) LIKE '%@%'
          )
    ) THEN
        RAISE EXCEPTION 'Store provenance migration found a URL with an unsupported scheme, query, fragment, or credentials; repair the legacy provenance URL before retrying';
    END IF;
END $$;

-- 1. Collision preflight for Packs.StoreImportUrl
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM ""Packs"" p1
        JOIN ""Packs"" p2 ON p1.""Id"" <> p2.""Id""
            AND canonicalize_store_url(p1.""StoreImportUrl"") = canonicalize_store_url(p2.""StoreImportUrl"")
            AND TRIM(p1.""StoreImportAssetId"") = TRIM(p2.""StoreImportAssetId"")
        WHERE p1.""StoreImportUrl"" IS NOT NULL AND p2.""StoreImportUrl"" IS NOT NULL
          AND TRIM(p1.""StoreImportUrl"") <> '' AND TRIM(p2.""StoreImportUrl"") <> ''
    ) THEN
        RAISE EXCEPTION 'Store provenance migration collision: Packs contains equivalent canonical store URLs targeting different pack IDs';
    END IF;
END $$;

-- 2. Update Packs.StoreImportUrl to canonical URLs
UPDATE ""Packs""
SET ""StoreImportUrl"" = canonicalize_store_url(""StoreImportUrl""),
    ""StoreImportAssetId"" = TRIM(""StoreImportAssetId"")
WHERE ""StoreImportUrl"" IS NOT NULL AND TRIM(""StoreImportUrl"") <> '';

-- 3. Collision preflight for AssetMetadata
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM ""AssetMetadata"" m1
        JOIN ""AssetMetadata"" m2 ON (m1.""AssetType"" <> m2.""AssetType"" OR m1.""AssetId"" <> m2.""AssetId"")
            AND canonicalize_store_url(m1.""StoreUrl"") = canonicalize_store_url(m2.""StoreUrl"")
            AND TRIM(m1.""StoreAssetId"") = TRIM(m2.""StoreAssetId"")
            AND TRIM(m1.""StoreItemId"") = TRIM(m2.""StoreItemId"")
        WHERE m1.""StoreUrl"" IS NOT NULL AND m1.""StoreItemId"" IS NOT NULL
          AND m2.""StoreUrl"" IS NOT NULL AND m2.""StoreItemId"" IS NOT NULL
          AND TRIM(m1.""StoreUrl"") <> '' AND TRIM(m2.""StoreUrl"") <> ''
    ) THEN
        RAISE EXCEPTION 'Store provenance migration collision: AssetMetadata contains equivalent canonical store items targeting different assets';
    END IF;
END $$;

-- 4. Update AssetMetadata.StoreUrl to canonical URLs
UPDATE ""AssetMetadata""
SET ""StoreUrl"" = canonicalize_store_url(""StoreUrl""),
    ""StoreAssetId"" = TRIM(""StoreAssetId""),
    ""StoreItemId"" = TRIM(""StoreItemId"")
WHERE ""StoreUrl"" IS NOT NULL AND TRIM(""StoreUrl"") <> '';

-- 5. Backfill StoreImportedItems from existing AssetMetadata
INSERT INTO ""StoreImportedItems"" (""StoreUrl"", ""StoreAssetId"", ""StoreItemId"", ""AssetType"", ""AssetId"", ""CreatedAt"")
SELECT DISTINCT ON (canonicalize_store_url(m.""StoreUrl""), TRIM(m.""StoreAssetId""), TRIM(m.""StoreItemId""))
    canonicalize_store_url(m.""StoreUrl""),
    TRIM(m.""StoreAssetId""),
    TRIM(m.""StoreItemId""),
    m.""AssetType"",
    m.""AssetId"",
    COALESCE(m.""ImportedAt"", m.""CreatedAt"", NOW())
FROM ""AssetMetadata"" m
WHERE m.""StoreUrl"" IS NOT NULL AND TRIM(m.""StoreUrl"") <> ''
  AND m.""StoreAssetId"" IS NOT NULL AND TRIM(m.""StoreAssetId"") <> ''
  AND m.""StoreItemId"" IS NOT NULL AND TRIM(m.""StoreItemId"") <> ''
ORDER BY canonicalize_store_url(m.""StoreUrl""), TRIM(m.""StoreAssetId""), TRIM(m.""StoreItemId""), m.""Id"" ASC
ON CONFLICT (""StoreUrl"", ""StoreAssetId"", ""StoreItemId"") DO NOTHING;

-- 6. Clean up temporary function
DROP FUNCTION canonicalize_store_url(text);
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StoreImportedItems");
        }
    }
}
