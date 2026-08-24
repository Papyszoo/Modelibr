using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Makes the database, rather than the application, responsible for there being one
    /// root category per name.
    ///
    /// <para>
    /// The existing unique index on each tree is (ParentId, Name) - and PostgreSQL treats
    /// NULLs as distinct, so it constrains children and says nothing whatsoever about
    /// roots. Two transactions inserting a root called "Vehicles" both succeeded. Uploading
    /// a folder sends its models in parallel and the import automation creates a root the
    /// first time it classifies one, which is exactly that shape; the result was a
    /// permanently split category somebody had to merge by hand.
    /// </para>
    ///
    /// <para>
    /// Reconciling in application code afterwards - scan, keep the lowest id, delete the
    /// rest - does not close it, which is why this is a schema change and not a code fix:
    /// the higher-id transaction can run its scan <i>before</i> the lower-id one commits,
    /// find nothing to defer to, and keep its own row. Both survive.
    /// </para>
    ///
    /// <para>
    /// Comparison is case-insensitive, matching what the application already means by "the
    /// same category" at the root: the import automation folds "Vehicles", "Vehicle" and
    /// "vehicles" into one. Child uniqueness is untouched and stays case-sensitive - a
    /// hand-built branch has always been free to hold both, and quietly tightening that
    /// would break existing libraries for no stated benefit.
    /// </para>
    ///
    /// <para>
    /// <b>Existing duplicates are merged, not dropped.</b> The block below picks the lowest
    /// id in each group as the winner, re-points every reference at it - asset FKs, the two
    /// raw scalar columns EF does not know about (<c>AssetMetadata.AutoCategoryId</c> and
    /// <c>AssetSearchDocuments.CategoryId</c>, both scoped by asset type), and the losers'
    /// child categories - and only then deletes the emptied rows. A child whose name would
    /// collide under its new parent is suffixed rather than discarded, because losing a
    /// branch to a schema tightening is not a trade anyone agreed to.
    /// </para>
    /// </summary>
    public partial class EnforceRootCategoryUniqueness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(MergeDuplicateRoots);

            // Partial, so it constrains roots only, and over lower("Name") so it means what
            // the application means. Expressed as raw SQL because neither an expression
            // index nor a partial index is reachable through the model builder.
            migrationBuilder.Sql("""
                CREATE UNIQUE INDEX "IX_ModelCategories_RootName"
                    ON "ModelCategories" (lower("Name")) WHERE "ParentId" IS NULL;
                CREATE UNIQUE INDEX "IX_SpriteCategories_RootName"
                    ON "SpriteCategories" (lower("Name")) WHERE "ParentId" IS NULL;
                CREATE UNIQUE INDEX "IX_SoundCategories_RootName"
                    ON "SoundCategories" (lower("Name")) WHERE "ParentId" IS NULL;
                CREATE UNIQUE INDEX "IX_ScriptCategories_RootName"
                    ON "ScriptCategories" (lower("Name")) WHERE "ParentId" IS NULL;
                CREATE UNIQUE INDEX "IX_EnvironmentMapCategories_RootName"
                    ON "EnvironmentMapCategories" (lower("Name")) WHERE "ParentId" IS NULL;
                """);

            // Texture set categories are partitioned by Kind: Universal (Global Materials)
            // and ModelSpecific (Multi-Model Textures) are separate asset types that never
            // share a vocabulary, so a "Stone" root in each is two categories rather than a
            // duplicate. The kind is part of the key here for the same reason it is part of
            // the existing child index.
            migrationBuilder.Sql("""
                CREATE UNIQUE INDEX "IX_TextureSetCategories_Kind_RootName"
                    ON "TextureSetCategories" ("Kind", lower("Name")) WHERE "ParentId" IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Only the indexes come back off. The merge is not reversed: the losing rows are
            // gone and their references moved, and inventing new rows to "restore" a split
            // nobody wanted would be a fresh data problem, not an undo.
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS "IX_ModelCategories_RootName";
                DROP INDEX IF EXISTS "IX_SpriteCategories_RootName";
                DROP INDEX IF EXISTS "IX_SoundCategories_RootName";
                DROP INDEX IF EXISTS "IX_ScriptCategories_RootName";
                DROP INDEX IF EXISTS "IX_EnvironmentMapCategories_RootName";
                DROP INDEX IF EXISTS "IX_TextureSetCategories_Kind_RootName";
                """);
        }

        /// <summary>
        /// Collapses each group of same-named roots onto its lowest id, moving every
        /// reference before deleting anything.
        /// </summary>
        private const string MergeDuplicateRoots = """
            DO $$
            DECLARE
                spec        RECORD;
                dup         RECORD;
                child       RECORD;
                losers      int[];
                candidate   text;
                suffix      int;
                taken       boolean;
            BEGIN
                FOR spec IN
                    SELECT * FROM (VALUES
                        ('ModelCategories',          'Models',          'ModelCategoryId',          ARRAY['Model'],                 false),
                        ('TextureSetCategories',     'TextureSets',     'TextureSetCategoryId',     ARRAY['TextureSet','Material'], true),
                        ('SpriteCategories',         'Sprites',         'SpriteCategoryId',         ARRAY['Sprite'],                false),
                        ('SoundCategories',          'Sounds',          'SoundCategoryId',          ARRAY['Sound'],                 false),
                        ('ScriptCategories',         'Scripts',         'ScriptCategoryId',         ARRAY[]::text[],                false),
                        ('EnvironmentMapCategories', 'EnvironmentMaps', 'EnvironmentMapCategoryId', ARRAY['EnvironmentMap'],        false)
                    ) AS t(cat_table, asset_table, asset_column, asset_types, has_kind)
                LOOP
                    FOR dup IN EXECUTE format(
                        'SELECT MIN("Id") AS winner, array_agg("Id") AS ids
                         FROM %I WHERE "ParentId" IS NULL
                         GROUP BY %s lower("Name") HAVING count(*) > 1',
                        spec.cat_table,
                        CASE WHEN spec.has_kind THEN '"Kind",' ELSE '' END)
                    LOOP
                        losers := array_remove(dup.ids, dup.winner);
                        CONTINUE WHEN array_length(losers, 1) IS NULL;

                        -- The asset that carries the category directly.
                        EXECUTE format(
                            'UPDATE %I SET %I = $1 WHERE %I = ANY($2)',
                            spec.asset_table, spec.asset_column, spec.asset_column)
                            USING dup.winner, losers;

                        -- Materials borrow the texture-set tree, so they are a second asset
                        -- table for that one spec and nobody else's.
                        IF spec.cat_table = 'TextureSetCategories' THEN
                            EXECUTE 'UPDATE "Materials" SET "CategoryId" = $1 WHERE "CategoryId" = ANY($2)'
                                USING dup.winner, losers;
                        END IF;

                        -- The two raw scalar columns: no FK declares them, so nothing but
                        -- this moves them, and a stale one points at a row about to go.
                        IF array_length(spec.asset_types, 1) IS NOT NULL THEN
                            EXECUTE 'UPDATE "AssetMetadata" SET "AutoCategoryId" = $1
                                     WHERE "AssetType" = ANY($2) AND "AutoCategoryId" = ANY($3)'
                                USING dup.winner, spec.asset_types, losers;
                            EXECUTE 'UPDATE "AssetSearchDocuments" SET "CategoryId" = $1
                                     WHERE "AssetType" = ANY($2) AND "CategoryId" = ANY($3)'
                                USING dup.winner, spec.asset_types, losers;
                        END IF;

                        -- Children move to the winner. A name already taken there is
                        -- suffixed rather than dropped: the (ParentId, Name) index would
                        -- refuse the move, and refusing it by deleting a branch is worse
                        -- than a renamed one.
                        FOR child IN EXECUTE format(
                            'SELECT "Id", "Name" FROM %I WHERE "ParentId" = ANY($1) ORDER BY "Id"',
                            spec.cat_table) USING losers
                        LOOP
                            candidate := child."Name";
                            suffix := 1;
                            LOOP
                                EXECUTE format(
                                    'SELECT EXISTS(SELECT 1 FROM %I WHERE "ParentId" = %s AND "Name" = %L%s)',
                                    spec.cat_table, dup.winner, candidate,
                                    CASE WHEN spec.has_kind
                                         THEN format(' AND "Kind" = (SELECT "Kind" FROM %I WHERE "Id" = %s)',
                                                     spec.cat_table, child."Id")
                                         ELSE '' END)
                                    INTO taken;
                                EXIT WHEN NOT taken;
                                suffix := suffix + 1;
                                candidate := child."Name" || ' (' || suffix || ')';
                            END LOOP;

                            EXECUTE format(
                                'UPDATE %I SET "ParentId" = %s, "Name" = %L WHERE "Id" = %s',
                                spec.cat_table, dup.winner, candidate, child."Id");
                        END LOOP;

                        -- Emptied of everything that pointed at them.
                        EXECUTE format('DELETE FROM %I WHERE "Id" = ANY($1)', spec.cat_table)
                            USING losers;
                    END LOOP;
                END LOOP;
            END $$;
            """;
    }
}
