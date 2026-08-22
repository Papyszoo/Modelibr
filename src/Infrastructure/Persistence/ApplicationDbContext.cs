using Application.Abstractions;
using Domain.Models;
using Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Infrastructure.Persistence
{
    public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : DbContext(options), IUnitOfWork, IChangeTrackerReset
    {
        void IChangeTrackerReset.Clear() => ChangeTracker.Clear();

        // Overridden (not just exposed via the explicit IUnitOfWork member below)
        // so the known-benign-race handling applies no matter which caller
        // reaches SaveChanges: Application-layer command handlers going through
        // IUnitOfWork.SaveChangesAsync, AND repositories that haven't been
        // migrated off self-committing yet (prompt 25 migrates them one bounded
        // area at a time) and call this directly. Domain-event dispatch is wired
        // separately via DomainEventsInterceptor (see
        // Infrastructure/DependencyInjection.cs) and runs regardless of path too.
        public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                return await base.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex) when (IsDuplicatePackModelAssociation(ex))
            {
                // Concurrent identical "add model to pack" requests can race on
                // the PackModels join table's composite PK. Treat the duplicate
                // insert as an idempotent no-op - moved here from
                // PackRepository.UpdateAsync when repositories stopped
                // self-committing (prompt 25); this is the one known-benign
                // race the app deliberately swallows at the commit boundary.
                ChangeTracker.Clear();
                return 0;
            }
        }

        Task IUnitOfWork.SaveChangesAsync(CancellationToken cancellationToken) =>
            SaveChangesAsync(cancellationToken);

        private static bool IsDuplicatePackModelAssociation(DbUpdateException ex)
            => ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: "PK_PackModels"
            };

        public DbSet<Model> Models => Set<Model>();
        public DbSet<ModelVersion> ModelVersions => Set<ModelVersion>();
        public DbSet<Domain.Models.File> Files => Set<Domain.Models.File>();
        public DbSet<Texture> Textures => Set<Texture>();
        public DbSet<TextureSet> TextureSets => Set<TextureSet>();
        public DbSet<Material> Materials => Set<Material>();
        public DbSet<Pack> Packs => Set<Pack>();
        public DbSet<Project> Projects => Set<Project>();
        public DbSet<ModelCategory> ModelCategories => Set<ModelCategory>();
        public DbSet<TextureSetCategory> TextureSetCategories => Set<TextureSetCategory>();
        public DbSet<ModelTag> ModelTags => Set<ModelTag>();
        public DbSet<ModelConceptImage> ModelConceptImages => Set<ModelConceptImage>();
        public DbSet<ProjectConceptImage> ProjectConceptImages => Set<ProjectConceptImage>();
        public DbSet<Stage> Stages => Set<Stage>();
        public DbSet<Scene> Scenes => Set<Scene>();
        public DbSet<SceneRender> SceneRenders => Set<SceneRender>();
        public DbSet<Thumbnail> Thumbnails => Set<Thumbnail>();
        public DbSet<ThumbnailJob> ThumbnailJobs => Set<ThumbnailJob>();
        public DbSet<ThumbnailJobEvent> ThumbnailJobEvents => Set<ThumbnailJobEvent>();
        public DbSet<ApplicationSettings> ApplicationSettings => Set<ApplicationSettings>();
        public DbSet<Setting> Settings => Set<Setting>();
        public DbSet<BatchUpload> BatchUploads => Set<BatchUpload>();
        public DbSet<Sprite> Sprites => Set<Sprite>();
        public DbSet<SpriteCategory> SpriteCategories => Set<SpriteCategory>();
        public DbSet<Sound> Sounds => Set<Sound>();
        public DbSet<SoundCategory> SoundCategories => Set<SoundCategory>();
        public DbSet<Script> Scripts => Set<Script>();
        public DbSet<ScriptTemplate> ScriptTemplates => Set<ScriptTemplate>();
        public DbSet<ScriptCategory> ScriptCategories => Set<ScriptCategory>();
        public DbSet<EnvironmentMapCategory> EnvironmentMapCategories => Set<EnvironmentMapCategory>();
        public DbSet<EnvironmentMap> EnvironmentMaps => Set<EnvironmentMap>();
        public DbSet<EnvironmentMapVariant> EnvironmentMapVariants => Set<EnvironmentMapVariant>();
        public DbSet<EnvironmentMapVariantFaceFile> EnvironmentMapVariantFaceFiles => Set<EnvironmentMapVariantFaceFile>();
        public DbSet<TextureProxy> TextureProxies => Set<TextureProxy>();
        public DbSet<ModelVersionTextureSet> ModelVersionTextureSets => Set<ModelVersionTextureSet>();
        public DbSet<AssetExtraction> AssetExtractions => Set<AssetExtraction>();
        public DbSet<AssetPart> AssetParts => Set<AssetPart>();
        public DbSet<ExtractionJob> ExtractionJobs => Set<ExtractionJob>();
        public DbSet<AssetDerivation> AssetDerivations => Set<AssetDerivation>();
        public DbSet<AssetSearchDocument> AssetSearchDocuments => Set<AssetSearchDocument>();
        public DbSet<SearchLog> SearchLogs => Set<SearchLog>();
        public DbSet<ComputeCacheEntry> ComputeCacheEntries => Set<ComputeCacheEntry>();
        public DbSet<AssetDerivationLineage> AssetDerivationLineages => Set<AssetDerivationLineage>();
        public DbSet<AgentOperationLog> AgentOperationLogs => Set<AgentOperationLog>();
        public DbSet<AgentUploadTicket> AgentUploadTickets => Set<AgentUploadTicket>();
        public DbSet<ModelVersionAuxiliaryFile> ModelVersionAuxiliaryFiles => Set<ModelVersionAuxiliaryFile>();
        public DbSet<StoreImportJob> StoreImportJobs => Set<StoreImportJob>();
        public DbSet<AssetMetadata> AssetMetadata => Set<AssetMetadata>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Configure many-to-many relationship between Model and TextureSet (DEPRECATED - kept for backward compatibility)
            modelBuilder.Entity<Model>()
                .HasMany(m => m.TextureSets)
                .WithMany(tp => tp.Models)
                .UsingEntity(j => j.ToTable("ModelTextureSets"));

            // Configure many-to-many relationship between ModelVersion and TextureSet via explicit join entity
            modelBuilder.Entity<ModelVersionTextureSet>(entity =>
            {
                entity.HasKey(mvts => new { mvts.ModelVersionId, mvts.TextureSetId, mvts.MaterialName, mvts.VariantName });
                entity.ToTable("ModelVersionTextureSets");

                entity.Property(mvts => mvts.MaterialName)
                    .HasMaxLength(200)
                    .HasDefaultValue(string.Empty);

                entity.Property(mvts => mvts.VariantName)
                    .HasMaxLength(200)
                    .HasDefaultValue(string.Empty);

                entity.HasOne(mvts => mvts.ModelVersion)
                    .WithMany(mv => mv.TextureMappings)
                    .HasForeignKey(mvts => mvts.ModelVersionId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(mvts => mvts.TextureSet)
                    .WithMany(ts => ts.ModelVersionMappings)
                    .HasForeignKey(mvts => mvts.TextureSetId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure many-to-many relationship between Model and Pack
            modelBuilder.Entity<Model>()
                .HasMany(m => m.Packs)
                .WithMany(p => p.Models)
                .UsingEntity(j => j.ToTable("PackModels"));

            // Configure many-to-many relationship between TextureSet and Pack
            modelBuilder.Entity<TextureSet>()
                .HasMany(ts => ts.Packs)
                .WithMany(p => p.TextureSets)
                .UsingEntity(j => j.ToTable("PackTextureSets"));

            // Configure many-to-many relationship between Model and Project
            modelBuilder.Entity<Model>()
                .HasMany(m => m.Projects)
                .WithMany(p => p.Models)
                .UsingEntity(j => j.ToTable("ProjectModels"));

            // Configure many-to-many relationship between TextureSet and Project
            modelBuilder.Entity<TextureSet>()
                .HasMany(ts => ts.Projects)
                .WithMany(p => p.TextureSets)
                .UsingEntity(j => j.ToTable("ProjectTextureSets"));

            // Configure many-to-many relationship between Sprite and Pack
            modelBuilder.Entity<Sprite>()
                .HasMany(s => s.Packs)
                .WithMany(p => p.Sprites)
                .UsingEntity(j => j.ToTable("PackSprites"));

            // Configure many-to-many relationship between Sprite and Project
            modelBuilder.Entity<Sprite>()
                .HasMany(s => s.Projects)
                .WithMany(p => p.Sprites)
                .UsingEntity(j => j.ToTable("ProjectSprites"));

            // Configure many-to-many relationship between Sound and Pack
            modelBuilder.Entity<Sound>()
                .HasMany(s => s.Packs)
                .WithMany(p => p.Sounds)
                .UsingEntity(j => j.ToTable("PackSounds"));

            // Configure many-to-many relationship between Sound and Project
            modelBuilder.Entity<Sound>()
                .HasMany(s => s.Projects)
                .WithMany(p => p.Sounds)
                .UsingEntity(j => j.ToTable("ProjectSounds"));

            // Configure many-to-many relationship between Script and Pack
            modelBuilder.Entity<Script>()
                .HasMany(s => s.Packs)
                .WithMany(p => p.Scripts)
                .UsingEntity(j => j.ToTable("PackScripts"));

            // Configure many-to-many relationship between Script and Project
            modelBuilder.Entity<Script>()
                .HasMany(s => s.Projects)
                .WithMany(p => p.Scripts)
                .UsingEntity(j => j.ToTable("ProjectScripts"));

            modelBuilder.Entity<EnvironmentMap>()
                .HasMany(e => e.Packs)
                .WithMany(p => p.EnvironmentMaps)
                .UsingEntity(j => j.ToTable("PackEnvironmentMaps"));

            modelBuilder.Entity<EnvironmentMap>()
                .HasMany(e => e.Projects)
                .WithMany(p => p.EnvironmentMaps)
                .UsingEntity(j => j.ToTable("ProjectEnvironmentMaps"));

            modelBuilder.Entity<EnvironmentMap>(entity =>
            {
                entity.Property(e => e.EnvironmentMapCategoryId).IsRequired(false);

                entity.HasOne(e => e.EnvironmentMapCategory)
                    .WithMany()
                    .HasForeignKey(e => e.EnvironmentMapCategoryId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasMany(e => e.Tags)
                    .WithMany()
                    .UsingEntity<Dictionary<string, object>>(
                        "EnvironmentMapTagAssignment",
                        right => right
                            .HasOne<ModelTag>()
                            .WithMany()
                            .HasForeignKey("ModelTagId")
                            .OnDelete(DeleteBehavior.Cascade),
                        left => left
                            .HasOne<EnvironmentMap>()
                            .WithMany()
                            .HasForeignKey("EnvironmentMapId")
                            .OnDelete(DeleteBehavior.Cascade),
                        join =>
                        {
                            join.ToTable("EnvironmentMapTagAssignments");
                            join.HasKey("EnvironmentMapId", "ModelTagId");
                            join.HasIndex("ModelTagId");
                        });

                entity.HasIndex(e => e.EnvironmentMapCategoryId);
            });

            // Configure Model entity
            modelBuilder.Entity<Model>(entity =>
            {
                entity.HasKey(m => m.Id);
                entity.Property(m => m.Name).IsRequired();
                entity.Property(m => m.CreatedAt).IsRequired();
                entity.Property(m => m.UpdatedAt).IsRequired();
                entity.Property(m => m.ModelCategoryId).IsRequired(false);
                entity.Property(m => m.IsDeleted).IsRequired();
                entity.Property(m => m.DeletedAt);

                // Configure one-to-one relationship with ActiveVersion
                entity.HasOne(m => m.ActiveVersion)
                    .WithOne()
                    .HasForeignKey<Model>(m => m.ActiveVersionId)
                    .OnDelete(DeleteBehavior.Restrict);

                // Configure one-to-many relationship with ModelVersions
                entity.HasMany(m => m.Versions)
                    .WithOne(v => v.Model)
                    .HasForeignKey(v => v.ModelId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(m => m.ModelCategory)
                    .WithMany()
                    .HasForeignKey(m => m.ModelCategoryId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasMany(m => m.Tags)
                    .WithMany(t => t.Models)
                    .UsingEntity<Dictionary<string, object>>(
                        "ModelTagAssignment",
                        right => right
                            .HasOne<ModelTag>()
                            .WithMany()
                            .HasForeignKey("ModelTagId")
                            .OnDelete(DeleteBehavior.Cascade),
                        left => left
                            .HasOne<Model>()
                            .WithMany()
                            .HasForeignKey("ModelId")
                            .OnDelete(DeleteBehavior.Cascade),
                        join =>
                        {
                            join.ToTable("ModelTagAssignments");
                            join.HasKey("ModelId", "ModelTagId");
                            join.HasIndex("ModelTagId");
                        });

                entity.HasMany(m => m.ConceptImages)
                    .WithOne(ci => ci.Model)
                    .HasForeignKey(ci => ci.ModelId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Add index for efficient soft delete queries
                entity.HasIndex(m => m.IsDeleted);
                entity.HasIndex(m => m.ModelCategoryId);

                // Add index for efficient ORDER BY UpdatedAt DESC pagination
                entity.HasIndex(m => m.UpdatedAt).HasDatabaseName("IX_Models_UpdatedAt");

                // Add index for ExistsByNameAsync (equality) and GetNamesByPrefixAsync (prefix/StartsWith)
                entity.HasIndex(m => m.Name).HasDatabaseName("IX_Models_Name");

                // Global query filter for soft deletes
                entity.HasQueryFilter(m => !m.IsDeleted);
            });

            modelBuilder.Entity<ModelTag>(entity =>
            {
                entity.ToTable("ModelTags");
                entity.HasKey(tag => tag.Id);
                entity.Property(tag => tag.Name)
                    .IsRequired()
                    .HasMaxLength(100);
                entity.Property(tag => tag.NormalizedName)
                    .IsRequired()
                    .HasMaxLength(100);
                entity.Property(tag => tag.CreatedAt).IsRequired();
                entity.Property(tag => tag.UpdatedAt).IsRequired();

                entity.HasIndex(tag => tag.NormalizedName)
                    .IsUnique();
            });

            // Configure ModelVersion entity
            modelBuilder.Entity<ModelVersion>(entity =>
            {
                entity.HasKey(v => v.Id);
                entity.Property(v => v.ModelId).IsRequired();
                entity.Property(v => v.VersionNumber).IsRequired();
                entity.Property(v => v.Description).HasMaxLength(1000);
                entity.Property(v => v.CreatedAt).IsRequired();
                entity.Property(v => v.IsDeleted).IsRequired();
                entity.Property(v => v.DeletedAt);

                // Map MaterialNames as a PostgreSQL text array column
                entity.Property(v => v.MaterialNames)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");

                // Map VariantNames as a PostgreSQL text array column
                entity.Property(v => v.VariantNames)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");

                // Map MainVariantName
                entity.Property(v => v.MainVariantName)
                    .HasMaxLength(200);
                entity.Property(v => v.TriangleCount).IsRequired(false);
                entity.Property(v => v.VertexCount).IsRequired(false);
                entity.Property(v => v.MeshCount).IsRequired(false);
                entity.Property(v => v.MaterialCount).IsRequired(false);
                entity.Property(v => v.BoundingBoxX).IsRequired(false);
                entity.Property(v => v.BoundingBoxY).IsRequired(false);
                entity.Property(v => v.BoundingBoxZ).IsRequired(false);
                entity.Property(v => v.AnimationCount).IsRequired(false);
                entity.Property(v => v.BoneCount).IsRequired(false);
                entity.Property(v => v.TechnicalDetailsUpdatedAt).IsRequired(false);

                // Map AnimationNames as a PostgreSQL text array column
                entity.Property(v => v.AnimationNames)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");

                // Create unique index on ModelId and VersionNumber
                entity.HasIndex(v => new { v.ModelId, v.VersionNumber }).IsUnique();

                // Add index for efficient soft delete queries
                entity.HasIndex(v => v.IsDeleted);

                // Global query filter for soft deletes
                entity.HasQueryFilter(v => !v.IsDeleted);

                // Configure optional relationship with default TextureSet
                entity.HasOne<TextureSet>()
                    .WithMany()
                    .HasForeignKey(v => v.DefaultTextureSetId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Configure many-to-many relationship with Files
                entity.HasMany(v => v.Files)
                    .WithOne(f => f.ModelVersion)
                    .HasForeignKey(f => f.ModelVersionId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Configure one-to-one relationship with Thumbnail
                // ModelVersion owns the relationship with ThumbnailId as foreign key
                // Use ThumbnailId, not Thumbnail.ModelVersionId which is kept for backwards compatibility
                entity.HasOne(v => v.Thumbnail)
                    .WithOne(t => t.ModelVersion)
                    .HasForeignKey<ModelVersion>(v => v.ThumbnailId)
                    .HasPrincipalKey<Thumbnail>(t => t.Id)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // Configure File entity
            modelBuilder.Entity<Domain.Models.File>(entity =>
            {
                entity.HasKey(f => f.Id);
                entity.Property(f => f.OriginalFileName).IsRequired();
                entity.Property(f => f.StoredFileName).IsRequired();
                entity.Property(f => f.FilePath).IsRequired();
                entity.Property(f => f.MimeType).IsRequired();
                entity.Property(f => f.Sha256Hash).IsRequired();
                entity.Property(f => f.IsDeleted).IsRequired();
                entity.Property(f => f.DeletedAt);
                
                // Configure FileType Value Object to be stored as string.
                // Read side resolves through the FileType registry so both
                // directions share one source of truth (see FileType.FromValue).
                entity.Property(f => f.FileType)
                    .HasConversion(
                        v => v.Value,
                        v => FileType.FromValue(v))
                    .IsRequired();

                // Add index for efficient soft delete queries
                entity.HasIndex(f => f.IsDeleted);

                // Global query filter for soft deletes
                entity.HasQueryFilter(f => !f.IsDeleted);
            });

            // Configure Texture entity
            modelBuilder.Entity<Texture>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.Property(t => t.FileId).IsRequired();
                entity.Property(t => t.TextureType).IsRequired();
                entity.Property(t => t.SourceChannel).IsRequired()
                    .HasDefaultValue(TextureChannel.RGB); // Default for backward compatibility
                entity.Property(t => t.CreatedAt).IsRequired();
                entity.Property(t => t.UpdatedAt).IsRequired();
                entity.Property(t => t.TextureSetId).IsRequired(false); // Optional relationship
                entity.Property(t => t.IsDeleted).IsRequired();
                entity.Property(t => t.DeletedAt);
                entity.Property(t => t.Width).IsRequired(false);
                entity.Property(t => t.Height).IsRequired(false);
                entity.Property(t => t.Format).IsRequired(false).HasMaxLength(20);

                // Configure relationship with File
                entity.HasOne(t => t.File)
                    .WithMany()
                    .HasForeignKey(t => t.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Create index for efficient querying by texture type
                entity.HasIndex(t => t.TextureType);
                
                // Create composite index for texture set, file, and source channel to ensure uniqueness within a texture set
                // This ensures a specific channel of a file can only be mapped to one texture type
                entity.HasIndex(t => new { t.TextureSetId, t.FileId, t.SourceChannel })
                    .IsUnique()
                    .HasFilter("\"TextureSetId\" IS NOT NULL AND \"IsDeleted\" = false");

                // Create composite index to ensure unique texture type per texture set (for non-deleted textures)
                entity.HasIndex(t => new { t.TextureSetId, t.TextureType })
                    .HasFilter("\"TextureSetId\" IS NOT NULL AND \"IsDeleted\" = false");

                // Add index for efficient soft delete queries
                entity.HasIndex(t => t.IsDeleted);

                // Global query filter for soft deletes
                entity.HasQueryFilter(t => !t.IsDeleted);
            });

            // Configure TextureProxy entity
            modelBuilder.Entity<TextureProxy>(entity =>
            {
                entity.HasKey(tp => tp.Id);
                entity.Property(tp => tp.TextureId).IsRequired();
                entity.Property(tp => tp.FileId).IsRequired();
                entity.Property(tp => tp.Size).IsRequired();
                entity.Property(tp => tp.CreatedAt).IsRequired();

                // Configure relationship with Texture
                entity.HasOne(tp => tp.Texture)
                    .WithMany(t => t.Proxies)
                    .HasForeignKey(tp => tp.TextureId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Configure relationship with File
                entity.HasOne(tp => tp.File)
                    .WithMany()
                    .HasForeignKey(tp => tp.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Unique constraint: one proxy per texture per size
                entity.HasIndex(tp => new { tp.TextureId, tp.Size })
                    .IsUnique();

                // Index for efficient querying by texture
                entity.HasIndex(tp => tp.TextureId);
            });

            // Configure TextureSet entity
            modelBuilder.Entity<TextureSet>(entity =>
            {
                entity.HasKey(tp => tp.Id);
                entity.Property(tp => tp.Name).IsRequired().HasMaxLength(200);
                entity.Property(tp => tp.TextureSetCategoryId).IsRequired(false);
                entity.Property(tp => tp.Kind).IsRequired()
                    .HasDefaultValue(TextureSetKind.ModelSpecific);
                entity.Property(tp => tp.TilingScaleX).IsRequired()
                    .HasDefaultValue(1.0f);
                entity.Property(tp => tp.TilingScaleY).IsRequired()
                    .HasDefaultValue(1.0f);
                entity.Property(tp => tp.UvMappingMode).IsRequired()
                    .HasDefaultValue(UvMappingMode.Standard);
                entity.Property(tp => tp.UvScale).IsRequired()
                    .HasDefaultValue(1.0f);
                entity.Property(tp => tp.PreviewGeometryType).IsRequired()
                    .HasMaxLength(20)
                    .HasDefaultValue("plane");
                entity.Property(tp => tp.CreatedAt).IsRequired();
                entity.Property(tp => tp.UpdatedAt).IsRequired();
                entity.Property(tp => tp.IsDeleted).IsRequired();
                entity.Property(tp => tp.DeletedAt);
                entity.Property(tp => tp.ThumbnailPath).HasMaxLength(500);
                entity.Property(tp => tp.PngThumbnailPath).HasMaxLength(500);

                // Configure one-to-many relationship with Textures
                entity.HasMany(tp => tp.Textures)
                    .WithOne()
                    .HasForeignKey(t => t.TextureSetId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(tp => tp.Category)
                    .WithMany()
                    .HasForeignKey(tp => tp.TextureSetCategoryId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Shared tag vocabulary - reuses the ModelTag pool, mirroring
                // the Model and EnvironmentMap tag joins.
                entity.HasMany(tp => tp.Tags)
                    .WithMany()
                    .UsingEntity<Dictionary<string, object>>(
                        "TextureSetTagAssignment",
                        right => right
                            .HasOne<ModelTag>()
                            .WithMany()
                            .HasForeignKey("ModelTagId")
                            .OnDelete(DeleteBehavior.Cascade),
                        left => left
                            .HasOne<TextureSet>()
                            .WithMany()
                            .HasForeignKey("TextureSetId")
                            .OnDelete(DeleteBehavior.Cascade),
                        join =>
                        {
                            join.ToTable("TextureSetTagAssignments");
                            join.HasKey("TextureSetId", "ModelTagId");
                            join.HasIndex("ModelTagId");
                        });

                // Create index for efficient querying by name
                entity.HasIndex(tp => tp.Name);
                entity.HasIndex(tp => tp.TextureSetCategoryId);

                // Add index for efficient querying by kind
                entity.HasIndex(tp => tp.Kind);

                // Add index for efficient soft delete queries
                entity.HasIndex(tp => tp.IsDeleted);

                // Global query filter for soft deletes
                entity.HasQueryFilter(tp => !tp.IsDeleted);
            });

            // Configure Material entity - the parameters-only half of the material
            // library. Browsed together with Universal texture sets, stored apart.
            modelBuilder.Entity<Material>(entity =>
            {
                entity.HasKey(m => m.Id);
                entity.Property(m => m.Name).IsRequired().HasMaxLength(200);
                entity.Property(m => m.Description).HasMaxLength(1000);
                entity.Property(m => m.CategoryId).IsRequired(false);
                entity.Property(m => m.PreviewGeometryType).IsRequired()
                    .HasMaxLength(20)
                    .HasDefaultValue("sphere");
                entity.Property(m => m.ThumbnailPath).HasMaxLength(500);
                entity.Property(m => m.PngThumbnailPath).HasMaxLength(500);
                entity.Property(m => m.CreatedAt).IsRequired();
                entity.Property(m => m.UpdatedAt).IsRequired();
                entity.Property(m => m.IsDeleted).IsRequired();
                entity.Property(m => m.DeletedAt);

                // Flattened rather than a JSON column: the merged browse surface
                // filters and sorts on these (metallic materials, dark materials),
                // and a JSON blob cannot be indexed for that without extra work.
                entity.OwnsOne(m => m.Parameters, parameters =>
                {
                    parameters.Property(p => p.BaseColorR).HasColumnName("BaseColorR").IsRequired();
                    parameters.Property(p => p.BaseColorG).HasColumnName("BaseColorG").IsRequired();
                    parameters.Property(p => p.BaseColorB).HasColumnName("BaseColorB").IsRequired();
                    parameters.Property(p => p.BaseColorA).HasColumnName("BaseColorA").IsRequired();
                    parameters.Property(p => p.Roughness).HasColumnName("Roughness").IsRequired();
                    parameters.Property(p => p.Metallic).HasColumnName("Metallic").IsRequired();
                    parameters.Property(p => p.EmissiveR).HasColumnName("EmissiveR").IsRequired();
                    parameters.Property(p => p.EmissiveG).HasColumnName("EmissiveG").IsRequired();
                    parameters.Property(p => p.EmissiveB).HasColumnName("EmissiveB").IsRequired();
                    parameters.Property(p => p.NormalScale).HasColumnName("NormalScale").IsRequired();
                    parameters.Property(p => p.OcclusionStrength).HasColumnName("OcclusionStrength").IsRequired();
                    parameters.Property(p => p.Ior).HasColumnName("Ior").IsRequired();
                    parameters.Property(p => p.AlphaMode).HasColumnName("AlphaMode")
                        .HasConversion<string>().HasMaxLength(16).IsRequired();
                    parameters.Property(p => p.AlphaCutoff).HasColumnName("AlphaCutoff").IsRequired();
                    parameters.Property(p => p.DoubleSided).HasColumnName("DoubleSided").IsRequired();
                });

                // The shared category vocabulary: the same TextureSetCategory rows
                // Universal texture sets use. Two pools behind one grid could not be
                // filtered coherently.
                entity.HasOne(m => m.Category)
                    .WithMany()
                    .HasForeignKey(m => m.CategoryId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Shared tag vocabulary - the same ModelTag pool as models,
                // environment maps and texture sets.
                entity.HasMany(m => m.Tags)
                    .WithMany()
                    .UsingEntity<Dictionary<string, object>>(
                        "MaterialTagAssignment",
                        right => right
                            .HasOne<ModelTag>()
                            .WithMany()
                            .HasForeignKey("ModelTagId")
                            .OnDelete(DeleteBehavior.Cascade),
                        left => left
                            .HasOne<Material>()
                            .WithMany()
                            .HasForeignKey("MaterialId")
                            .OnDelete(DeleteBehavior.Cascade),
                        join =>
                        {
                            join.ToTable("MaterialTagAssignments");
                            join.HasKey("MaterialId", "ModelTagId");
                            join.HasIndex("ModelTagId");
                        });

                entity.HasIndex(m => m.Name);
                entity.HasIndex(m => m.CategoryId);
                entity.HasIndex(m => m.IsDeleted);

                entity.HasQueryFilter(m => !m.IsDeleted);
            });

            // Configure Pack entity
            modelBuilder.Entity<Pack>(entity =>
            {
                entity.HasKey(p => p.Id);
                entity.Property(p => p.Name).IsRequired().HasMaxLength(200);
                entity.Property(p => p.Description).HasMaxLength(1000);
                entity.Property(p => p.LicenseType).HasMaxLength(100);
                entity.Property(p => p.Url).HasMaxLength(500);
                entity.Property(p => p.CreatedAt).IsRequired();
                entity.Property(p => p.UpdatedAt).IsRequired();

                entity.HasOne(p => p.CustomThumbnailFile)
                    .WithMany()
                    .HasForeignKey(p => p.CustomThumbnailFileId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Store-import provenance (v0.5 prompt 05). The (StoreImportUrl,
                // StoreImportAssetId) pair is the idempotency key for re-imports.
                entity.Property(p => p.StoreImportUrl).HasMaxLength(500);
                entity.Property(p => p.StoreImportAssetId).HasMaxLength(200);
                // UNIQUE so the idempotency key is enforced by the database, not just by the
                // importer's read-then-write lookup: two concurrent imports of the same store
                // asset both pass that lookup, and only the index stops the second from creating
                // a duplicate pack. Filtered because the columns are null for every pack not
                // created by the importer.
                entity.HasIndex(p => new { p.StoreImportUrl, p.StoreImportAssetId })
                    .IsUnique()
                    .HasFilter("\"StoreImportUrl\" IS NOT NULL");

                // Create index for efficient querying by name
                entity.HasIndex(p => p.Name);
                entity.HasIndex(p => p.LicenseType);
            });

            // Configure StoreImportJob entity (v0.5 prompt 05). No import token is stored.
            modelBuilder.Entity<StoreImportJob>(entity =>
            {
                entity.HasKey(j => j.Id);
                entity.Property(j => j.StoreUrl).IsRequired().HasMaxLength(500);
                entity.Property(j => j.StoreAssetId).IsRequired().HasMaxLength(200);
                entity.Property(j => j.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
                entity.Property(j => j.ErrorMessage).HasMaxLength(2000);
                entity.Property(j => j.CreatedAt).IsRequired();
                entity.Property(j => j.UpdatedAt).IsRequired();

                entity.HasIndex(j => new { j.StoreUrl, j.StoreAssetId });
                entity.HasIndex(j => j.Status);
            });

            // Configure Project entity
            modelBuilder.Entity<Project>(entity =>
            {
                entity.HasKey(p => p.Id);
                entity.Property(p => p.Name).IsRequired().HasMaxLength(200);
                entity.Property(p => p.Description).HasMaxLength(1000);
                entity.Property(p => p.Notes).HasMaxLength(4000);
                entity.Property(p => p.CreatedAt).IsRequired();
                entity.Property(p => p.UpdatedAt).IsRequired();

                entity.HasOne(p => p.CustomThumbnailFile)
                    .WithMany()
                    .HasForeignKey(p => p.CustomThumbnailFileId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasMany(p => p.ConceptImages)
                    .WithOne(ci => ci.Project)
                    .HasForeignKey(ci => ci.ProjectId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Create index for efficient querying by name
                entity.HasIndex(p => p.Name);
            });

            modelBuilder.Entity<ModelCategory>(entity =>
            {
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
                entity.Property(c => c.Description).HasMaxLength(500);
                entity.Property(c => c.CreatedAt).IsRequired();
                entity.Property(c => c.UpdatedAt).IsRequired();

                entity.HasOne(c => c.Parent)
                    .WithMany(c => c.Children)
                    .HasForeignKey(c => c.ParentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(c => new { c.ParentId, c.Name }).IsUnique();
            });

            modelBuilder.Entity<TextureSetCategory>(entity =>
            {
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
                entity.Property(c => c.Description).HasMaxLength(500);
                // No HasDefaultValue here: EF Core would treat ModelSpecific
                // (=0, the CLR default) as "unset" and let the store default
                // win, silently saving Multi-Model categories as Universal.
                // Existing rows were backfilled to Universal by the
                // AddKindToTextureSetCategory migration.
                entity.Property(c => c.Kind).IsRequired();
                entity.Property(c => c.CreatedAt).IsRequired();
                entity.Property(c => c.UpdatedAt).IsRequired();

                entity.HasOne(c => c.Parent)
                    .WithMany(c => c.Children)
                    .HasForeignKey(c => c.ParentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(c => new { c.Kind, c.ParentId, c.Name }).IsUnique();
            });

            modelBuilder.Entity<ModelConceptImage>(entity =>
            {
                entity.HasKey(ci => ci.Id);
                entity.Property(ci => ci.SortOrder).IsRequired();
                entity.Property(ci => ci.CreatedAt).IsRequired();

                entity.HasOne(ci => ci.File)
                    .WithMany()
                    .HasForeignKey(ci => ci.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(ci => new { ci.ModelId, ci.FileId }).IsUnique();
                entity.HasIndex(ci => new { ci.ModelId, ci.SortOrder });
            });

            modelBuilder.Entity<ProjectConceptImage>(entity =>
            {
                entity.HasKey(ci => ci.Id);
                entity.Property(ci => ci.SortOrder).IsRequired();
                entity.Property(ci => ci.CreatedAt).IsRequired();

                entity.HasOne(ci => ci.File)
                    .WithMany()
                    .HasForeignKey(ci => ci.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(ci => new { ci.ProjectId, ci.FileId }).IsUnique();
                entity.HasIndex(ci => new { ci.ProjectId, ci.SortOrder });
            });

            // Configure Stage entity
            modelBuilder.Entity<Stage>(entity =>
            {
                entity.HasKey(s => s.Id);
                entity.Property(s => s.Name).IsRequired().HasMaxLength(200);
                entity.Property(s => s.ConfigurationJson).IsRequired();
                entity.Property(s => s.CreatedAt).IsRequired();
                entity.Property(s => s.UpdatedAt).IsRequired();

                // Create index for efficient querying by name
                entity.HasIndex(s => s.Name);
            });

            // Configure Scene entity - an agent-authorable composition of library assets.
            // The document is stored as validated JSON rather than shredded into node rows:
            // it is read and written whole, the editor's undo works on whole documents, and
            // a relational node table would buy nothing but joins. SchemaVersion is a column
            // so a future migration can find documents by version without parsing every row.
            modelBuilder.Entity<Scene>(entity =>
            {
                entity.HasKey(s => s.Id);
                entity.Property(s => s.Name).IsRequired().HasMaxLength(200);
                entity.Property(s => s.Description).HasMaxLength(2000);
                entity.Property(s => s.SchemaVersion).IsRequired();
                entity.Property(s => s.DocumentJson).IsRequired();
                // Concurrency token, not just a counter: every accepted write bumps it, so
                // the UPDATE carries the revision its writer read and matches no row once
                // someone else has committed. Without this, an in-memory revision check
                // passes for both of two concurrent writers - they both read N, both write
                // N+1, and the first edit is lost with nothing reported anywhere.
                entity.Property(s => s.Revision).IsRequired().IsConcurrencyToken();
                entity.Property(s => s.CreatedAt).IsRequired();
                entity.Property(s => s.UpdatedAt).IsRequired();

                entity.HasIndex(s => s.Name);
                entity.HasIndex(s => s.UpdatedAt);
            });

            // Configure SceneRender entity
            modelBuilder.Entity<SceneRender>(entity =>
            {
                entity.HasKey(sr => sr.Id);
                entity.Property(sr => sr.SceneId).IsRequired();
                entity.Property(sr => sr.ThumbnailJobId).IsRequired();
                entity.Property(sr => sr.Viewpoint).IsRequired().HasMaxLength(20);
                entity.Property(sr => sr.FilePath).IsRequired();
                entity.Property(sr => sr.SizeBytes).IsRequired();
                entity.Property(sr => sr.Width).IsRequired();
                entity.Property(sr => sr.Height).IsRequired();
                entity.Property(sr => sr.NodesLoaded).IsRequired();
                entity.Property(sr => sr.NodesFailed).IsRequired();
                entity.Property(sr => sr.TimedOut).IsRequired();
                // Nullable rather than defaulted: renders taken before revisions were
                // recorded genuinely do not know which revision they show, and a zero would
                // claim they do.
                entity.Property(sr => sr.RequestedRevision).IsRequired(false);
                entity.Property(sr => sr.RenderedRevision).IsRequired(false);
                entity.Ignore(sr => sr.SceneChangedDuringRender);
                entity.Property(sr => sr.CreatedAt).IsRequired();

                entity.HasOne(sr => sr.Scene)
                    .WithMany()
                    .HasForeignKey(sr => sr.SceneId)
                    .OnDelete(DeleteBehavior.Cascade);

                // One render per job - a job produces exactly one picture, and a retry
                // replaces the attempt rather than adding a second row.
                entity.HasIndex(sr => sr.ThumbnailJobId).IsUnique();

                // The polling path: newest render for a scene.
                entity.HasIndex(sr => new { sr.SceneId, sr.CreatedAt });
            });

            // Configure Thumbnail entity
            modelBuilder.Entity<Thumbnail>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.Property(t => t.ModelId).IsRequired();
                // ModelVersionId is a shadow property kept for tracking but not used as FK (ModelVersion.ThumbnailId is the FK)
                entity.Property(t => t.ModelVersionId).IsRequired();
                entity.Property(t => t.Status).IsRequired();
                entity.Property(t => t.ThumbnailPath).HasMaxLength(500);
                entity.Property(t => t.ErrorMessage).HasMaxLength(1000);
                entity.Property(t => t.CreatedAt).IsRequired();
                entity.Property(t => t.UpdatedAt).IsRequired();

                // Create unique index for ModelVersionId to ensure one thumbnail per version
                entity.HasIndex(t => t.ModelVersionId).IsUnique();
                
                // Note: The relationship is configured on ModelVersion side using ThumbnailId as FK
                // This ModelVersionId property is kept for backwards compatibility and tracking
            });

            // Configure ThumbnailJob entity
            modelBuilder.Entity<ThumbnailJob>(entity =>
            {
                entity.HasKey(tj => tj.Id);
                entity.Property(tj => tj.AssetType).IsRequired().HasMaxLength(20);
                entity.Property(tj => tj.ModelId).IsRequired(false);
                entity.Property(tj => tj.ModelVersionId).IsRequired(false);
                entity.Property(tj => tj.ModelHash).IsRequired(false).HasMaxLength(64);
                entity.Property(tj => tj.SoundId).IsRequired(false);
                entity.Property(tj => tj.SoundHash).IsRequired(false).HasMaxLength(64);
                entity.Property(tj => tj.TextureSetId).IsRequired(false);
                entity.Property(tj => tj.EnvironmentMapId).IsRequired(false);
                entity.Property(tj => tj.EnvironmentMapVariantId).IsRequired(false);
                entity.Property(tj => tj.SceneId).IsRequired(false);
                entity.Property(tj => tj.SceneViewpoint).IsRequired(false).HasMaxLength(20);
                entity.Property(tj => tj.SceneRevision).IsRequired(false);
                entity.Property(tj => tj.Status).IsRequired();
                entity.Property(tj => tj.AttemptCount).IsRequired();
                entity.Property(tj => tj.MaxAttempts).IsRequired();
                entity.Property(tj => tj.ErrorMessage).HasMaxLength(2000);
                entity.Property(tj => tj.LockedBy).HasMaxLength(100);
                entity.Property(tj => tj.LockTimeoutMinutes).IsRequired();
                entity.Property(tj => tj.CreatedAt).IsRequired();
                entity.Property(tj => tj.UpdatedAt).IsRequired();
                entity.Property(tj => tj.ProxySize).IsRequired(false);

                // Create composite unique index for ModelHash + ModelVersionId to prevent duplicate jobs per version
                // This allows different versions to have separate thumbnail jobs even when sharing the same model file
                entity.HasIndex(tj => new { tj.ModelHash, tj.ModelVersionId })
                    .IsUnique()
                    .HasFilter("[ModelHash] IS NOT NULL AND [ModelVersionId] IS NOT NULL");
                
                // Create unique index for SoundHash to prevent duplicate waveform jobs
                entity.HasIndex(tj => tj.SoundHash)
                    .IsUnique()
                    .HasFilter("[SoundHash] IS NOT NULL");
                
                // Create index for efficient job querying
                entity.HasIndex(tj => new { tj.Status, tj.CreatedAt });

                // Configure relationship with Model
                entity.HasOne(tj => tj.Model)
                    .WithMany()
                    .HasForeignKey(tj => tj.ModelId)
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired(false);

                // Configure relationship with ModelVersion
                entity.HasOne(tj => tj.ModelVersion)
                    .WithMany()
                    .HasForeignKey(tj => tj.ModelVersionId)
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired(false);

                // Configure relationship with Sound
                entity.HasOne(tj => tj.Sound)
                    .WithMany()
                    .HasForeignKey(tj => tj.SoundId)
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired(false);

                // Configure relationship with TextureSet
                entity.HasOne(tj => tj.TextureSet)
                    .WithMany()
                    .HasForeignKey(tj => tj.TextureSetId)
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired(false);

                entity.HasOne(tj => tj.EnvironmentMap)
                    .WithMany()
                    .HasForeignKey(tj => tj.EnvironmentMapId)
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired(false);

                entity.HasOne(tj => tj.EnvironmentMapVariant)
                    .WithMany()
                    .HasForeignKey(tj => tj.EnvironmentMapVariantId)
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired(false);

                entity.HasIndex(tj => tj.EnvironmentMapVariantId)
                    .IsUnique()
                    .HasFilter("\"EnvironmentMapVariantId\" IS NOT NULL");

                entity.HasOne(tj => tj.Scene)
                    .WithMany()
                    .HasForeignKey(tj => tj.SceneId)
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired(false);

                // Deliberately not unique, unlike the hash indexes above. A scene render
                // asks what the scene looks like now, and the scene moves - so a second
                // request for the same scene is a new question, not a duplicate.
            });

            // Configure ThumbnailJobEvent entity
            modelBuilder.Entity<ThumbnailJobEvent>(entity =>
            {
                entity.HasKey(tje => tje.Id);
                entity.Property(tje => tje.ThumbnailJobId).IsRequired();
                entity.Property(tje => tje.EventType).IsRequired().HasMaxLength(100);
                entity.Property(tje => tje.Message).IsRequired().HasMaxLength(1000);
                entity.Property(tje => tje.Metadata).HasMaxLength(4000);
                entity.Property(tje => tje.ErrorMessage).HasMaxLength(2000);
                entity.Property(tje => tje.OccurredAt).IsRequired();

                // Create index for efficient querying by job and time
                entity.HasIndex(tje => new { tje.ThumbnailJobId, tje.OccurredAt });

                // Configure relationship with ThumbnailJob
                entity.HasOne(tje => tje.ThumbnailJob)
                    .WithMany()
                    .HasForeignKey(tje => tje.ThumbnailJobId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure ApplicationSettings entity
            modelBuilder.Entity<ApplicationSettings>(entity =>
            {
                entity.HasKey(s => s.Id);
                entity.Property(s => s.MaxFileSizeBytes).IsRequired();
                entity.Property(s => s.MaxThumbnailSizeBytes).IsRequired();
                entity.Property(s => s.ThumbnailFrameCount).IsRequired();
                entity.Property(s => s.ThumbnailSize).IsRequired();
                entity.Property(s => s.CleanRecycledFilesAfterDays).IsRequired();
                entity.Property(s => s.TextureProxySize).IsRequired()
                    .HasDefaultValue(512);
                entity.Property(s => s.CreatedAt).IsRequired();
                entity.Property(s => s.UpdatedAt).IsRequired();
            });

            // Configure Setting entity
            modelBuilder.Entity<Setting>(entity =>
            {
                entity.HasKey(s => s.Id);
                entity.Property(s => s.Key).IsRequired().HasMaxLength(100);
                entity.Property(s => s.Value).IsRequired().HasMaxLength(1000);
                entity.Property(s => s.Description).HasMaxLength(500);
                entity.Property(s => s.CreatedAt).IsRequired();
                entity.Property(s => s.UpdatedAt).IsRequired();

                // Create unique index on Key to ensure no duplicate keys
                entity.HasIndex(s => s.Key).IsUnique();
            });

            // Configure BatchUpload entity
            modelBuilder.Entity<BatchUpload>(entity =>
            {
                entity.HasKey(bu => bu.Id);
                entity.Property(bu => bu.BatchId).IsRequired().HasMaxLength(100);
                entity.Property(bu => bu.UploadType).IsRequired().HasMaxLength(50);
                entity.Property(bu => bu.UploadedAt).IsRequired();
                entity.Property(bu => bu.FileId).IsRequired();

                // Create index for efficient querying by batch ID
                entity.HasIndex(bu => bu.BatchId);
                
                // Create index for efficient querying by upload type
                entity.HasIndex(bu => bu.UploadType);
                
                // Create index for efficient querying by timestamp
                entity.HasIndex(bu => bu.UploadedAt);
                
                // Configure relationship with File
                entity.HasOne(bu => bu.File)
                    .WithMany()
                    .HasForeignKey(bu => bu.FileId)
                    .OnDelete(DeleteBehavior.Cascade);
                
                // Configure optional relationship with Pack
                entity.HasOne(bu => bu.Pack)
                    .WithMany()
                    .HasForeignKey(bu => bu.PackId)
                    .OnDelete(DeleteBehavior.SetNull);
                
                // Configure optional relationship with Project
                entity.HasOne(bu => bu.Project)
                    .WithMany()
                    .HasForeignKey(bu => bu.ProjectId)
                    .OnDelete(DeleteBehavior.SetNull);
                
                // Configure optional relationship with Model
                entity.HasOne(bu => bu.Model)
                    .WithMany()
                    .HasForeignKey(bu => bu.ModelId)
                    .OnDelete(DeleteBehavior.SetNull);
                
                // Configure optional relationship with TextureSet
                entity.HasOne(bu => bu.TextureSet)
                    .WithMany()
                    .HasForeignKey(bu => bu.TextureSetId)
                    .OnDelete(DeleteBehavior.SetNull);
                
                // Configure optional relationship with Sprite
                entity.HasOne(bu => bu.Sprite)
                    .WithMany()
                    .HasForeignKey(bu => bu.SpriteId)
                    .OnDelete(DeleteBehavior.SetNull);
                
                // Configure optional relationship with Sound
                entity.HasOne(bu => bu.Sound)
                    .WithMany()
                    .HasForeignKey(bu => bu.SoundId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(bu => bu.EnvironmentMap)
                    .WithMany()
                    .HasForeignKey(bu => bu.EnvironmentMapId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // Configure Sprite entity
            modelBuilder.Entity<Sprite>(entity =>
            {
                entity.HasKey(s => s.Id);
                entity.Property(s => s.Name).IsRequired().HasMaxLength(200);
                entity.Property(s => s.FileId).IsRequired();
                entity.Property(s => s.SpriteType).IsRequired();
                entity.Property(s => s.Description).IsRequired(false);
                entity.Property(s => s.CreatedAt).IsRequired();
                entity.Property(s => s.UpdatedAt).IsRequired();
                entity.Property(s => s.IsDeleted).IsRequired();
                entity.Property(s => s.DeletedAt);

                // Configure relationship with File
                entity.HasOne(s => s.File)
                    .WithMany()
                    .HasForeignKey(s => s.FileId)
                    .OnDelete(DeleteBehavior.Cascade);


                // Shared tag vocabulary - the same ModelTag pool as every other taggable
                // family (prompt 16-D). Sprites were the last two families with no tags
                // at all, which made "tag what you imported" a per-family question.
                entity.HasMany(s => s.Tags)
                    .WithMany()
                    .UsingEntity<Dictionary<string, object>>(
                        "SpriteTagAssignment",
                        right => right
                            .HasOne<ModelTag>()
                            .WithMany()
                            .HasForeignKey("ModelTagId")
                            .OnDelete(DeleteBehavior.Cascade),
                        left => left
                            .HasOne<Sprite>()
                            .WithMany()
                            .HasForeignKey("SpriteId")
                            .OnDelete(DeleteBehavior.Cascade),
                        join =>
                        {
                            join.ToTable("SpriteTagAssignments");
                            join.HasKey("SpriteId", "ModelTagId");
                            join.HasIndex("ModelTagId");
                        });

                // Configure optional relationship with SpriteCategory
                entity.HasOne(s => s.Category)
                    .WithMany()
                    .HasForeignKey(s => s.SpriteCategoryId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Create index for efficient querying by name
                entity.HasIndex(s => s.Name);

                // Add index for efficient soft delete queries
                entity.HasIndex(s => s.IsDeleted);

                // Global query filter for soft deletes
                entity.HasQueryFilter(s => !s.IsDeleted);
            });

            // Configure SpriteCategory entity
            modelBuilder.Entity<SpriteCategory>(entity =>
            {
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
                entity.Property(c => c.Description).HasMaxLength(500);
                entity.Property(c => c.CreatedAt).IsRequired();
                entity.Property(c => c.UpdatedAt).IsRequired();

                entity.HasOne(c => c.Parent)
                    .WithMany(c => c.Children)
                    .HasForeignKey(c => c.ParentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(c => new { c.ParentId, c.Name }).IsUnique();
            });

            // Configure Sound entity
            modelBuilder.Entity<Sound>(entity =>
            {
                entity.HasKey(s => s.Id);
                entity.Property(s => s.Name).IsRequired().HasMaxLength(200);
                entity.Property(s => s.FileId).IsRequired();
                entity.Property(s => s.Duration).IsRequired();
                entity.Property(s => s.Peaks);
                entity.Property(s => s.SampleRate).IsRequired(false);
                entity.Property(s => s.Channels).IsRequired(false);
                entity.Property(s => s.Format).IsRequired(false).HasMaxLength(20);
                entity.Property(s => s.Description).IsRequired(false);
                entity.Property(s => s.CreatedAt).IsRequired();
                entity.Property(s => s.UpdatedAt).IsRequired();
                entity.Property(s => s.IsDeleted).IsRequired();
                entity.Property(s => s.DeletedAt);

                // Configure relationship with File
                entity.HasOne(s => s.File)
                    .WithMany()
                    .HasForeignKey(s => s.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Shared tag vocabulary - the same ModelTag pool as every other taggable
                // family (prompt 16-D). Sounds were the last two families with no tags
                // at all, which made "tag what you imported" a per-family question.
                entity.HasMany(s => s.Tags)
                    .WithMany()
                    .UsingEntity<Dictionary<string, object>>(
                        "SoundTagAssignment",
                        right => right
                            .HasOne<ModelTag>()
                            .WithMany()
                            .HasForeignKey("ModelTagId")
                            .OnDelete(DeleteBehavior.Cascade),
                        left => left
                            .HasOne<Sound>()
                            .WithMany()
                            .HasForeignKey("SoundId")
                            .OnDelete(DeleteBehavior.Cascade),
                        join =>
                        {
                            join.ToTable("SoundTagAssignments");
                            join.HasKey("SoundId", "ModelTagId");
                            join.HasIndex("ModelTagId");
                        });


                // Configure optional relationship with SoundCategory
                entity.HasOne(s => s.Category)
                    .WithMany()
                    .HasForeignKey(s => s.SoundCategoryId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Create index for efficient querying by name
                entity.HasIndex(s => s.Name);

                // Add index for efficient soft delete queries
                entity.HasIndex(s => s.IsDeleted);

                // Global query filter for soft deletes
                entity.HasQueryFilter(s => !s.IsDeleted);
            });

            // Configure SoundCategory entity
            modelBuilder.Entity<SoundCategory>(entity =>
            {
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
                entity.Property(c => c.Description).HasMaxLength(500);
                entity.Property(c => c.CreatedAt).IsRequired();
                entity.Property(c => c.UpdatedAt).IsRequired();

                entity.HasOne(c => c.Parent)
                    .WithMany(c => c.Children)
                    .HasForeignKey(c => c.ParentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(c => new { c.ParentId, c.Name }).IsUnique();
            });

            // Configure Script entity
            modelBuilder.Entity<Script>(entity =>
            {
                entity.HasKey(s => s.Id);
                entity.Property(s => s.Name).IsRequired().HasMaxLength(200);
                entity.Property(s => s.FileId).IsRequired();
                entity.Property(s => s.Language).IsRequired().HasMaxLength(50);
                entity.Property(s => s.LineCount).IsRequired();
                entity.Property(s => s.SizeBytes).IsRequired();
                entity.Property(s => s.Description).HasMaxLength(2000);
                entity.Property(s => s.CreatedAt).IsRequired();
                entity.Property(s => s.UpdatedAt).IsRequired();
                entity.Property(s => s.IsDeleted).IsRequired();
                entity.Property(s => s.DeletedAt);

                // Configure relationship with File
                entity.HasOne(s => s.File)
                    .WithMany()
                    .HasForeignKey(s => s.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Configure optional relationship with ScriptCategory
                entity.HasOne(s => s.Category)
                    .WithMany()
                    .HasForeignKey(s => s.ScriptCategoryId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Create index for efficient querying by name
                entity.HasIndex(s => s.Name);

                // Add index for efficient soft delete queries
                entity.HasIndex(s => s.IsDeleted);

                // Global query filter for soft deletes
                entity.HasQueryFilter(s => !s.IsDeleted);
            });

            // Configure ScriptTemplate entity
            modelBuilder.Entity<ScriptTemplate>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.Property(t => t.Name).IsRequired().HasMaxLength(200);
                entity.Property(t => t.Language).IsRequired().HasMaxLength(50);
                entity.Property(t => t.Content).IsRequired();
                entity.Property(t => t.Description).HasMaxLength(2000);
                entity.Property(t => t.CreatedAt).IsRequired();
                entity.Property(t => t.UpdatedAt).IsRequired();
                entity.HasIndex(t => t.Name);
            });

            // Configure ScriptCategory entity
            modelBuilder.Entity<ScriptCategory>(entity =>
            {
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
                entity.Property(c => c.Description).HasMaxLength(500);
                entity.Property(c => c.CreatedAt).IsRequired();
                entity.Property(c => c.UpdatedAt).IsRequired();

                entity.HasOne(c => c.Parent)
                    .WithMany(c => c.Children)
                    .HasForeignKey(c => c.ParentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(c => new { c.ParentId, c.Name }).IsUnique();
            });

            modelBuilder.Entity<EnvironmentMapCategory>(entity =>
            {
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
                entity.Property(c => c.Description).HasMaxLength(500);
                entity.Property(c => c.CreatedAt).IsRequired();
                entity.Property(c => c.UpdatedAt).IsRequired();

                entity.HasOne(c => c.Parent)
                    .WithMany(c => c.Children)
                    .HasForeignKey(c => c.ParentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(c => new { c.ParentId, c.Name }).IsUnique();
            });

            modelBuilder.Entity<EnvironmentMap>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
                entity.Property(e => e.PreviewVariantId).IsRequired(false);
                entity.Property(e => e.CustomThumbnailFileId).IsRequired(false);
                entity.Property(e => e.CreatedAt).IsRequired();
                entity.Property(e => e.UpdatedAt).IsRequired();
                entity.Property(e => e.IsDeleted).IsRequired();
                entity.Property(e => e.DeletedAt);

                entity.HasOne(e => e.CustomThumbnailFile)
                    .WithMany()
                    .HasForeignKey(e => e.CustomThumbnailFileId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasIndex(e => e.Name);
                entity.HasIndex(e => e.IsDeleted);

                entity.HasQueryFilter(e => !e.IsDeleted);
            });

            modelBuilder.Entity<EnvironmentMapVariant>(entity =>
            {
                entity.HasKey(v => v.Id);
                entity.Property(v => v.EnvironmentMapId).IsRequired();
                entity.Property(v => v.FileId).IsRequired(false);
                entity.Property(v => v.ProjectionType).IsRequired();
                entity.Property(v => v.SizeLabel).IsRequired().HasMaxLength(50);
                entity.Property(v => v.ThumbnailPath).HasMaxLength(500);
                entity.Property(v => v.CreatedAt).IsRequired();
                entity.Property(v => v.UpdatedAt).IsRequired();
                entity.Property(v => v.IsDeleted).IsRequired();
                entity.Property(v => v.DeletedAt);

                entity.HasOne(v => v.File)
                    .WithMany()
                    .HasForeignKey(v => v.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne<EnvironmentMap>()
                    .WithMany(e => e.Variants)
                    .HasForeignKey(v => v.EnvironmentMapId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(v => v.FaceFiles)
                    .WithOne()
                    .HasForeignKey(faceFile => faceFile.EnvironmentMapVariantId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(v => v.IsDeleted);
                entity.HasIndex(v => new { v.EnvironmentMapId, v.SizeLabel })
                    .IsUnique()
                    .HasFilter("\"IsDeleted\" = false");

                entity.HasQueryFilter(v => !v.IsDeleted);
            });

            modelBuilder.Entity<EnvironmentMapVariantFaceFile>(entity =>
            {
                entity.HasKey(faceFile => new { faceFile.EnvironmentMapVariantId, faceFile.Face });
                entity.Property(faceFile => faceFile.FileId).IsRequired();

                entity.HasOne(faceFile => faceFile.File)
                    .WithMany()
                    .HasForeignKey(faceFile => faceFile.FileId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure AssetExtraction - raw, versioned extractor output.
            modelBuilder.Entity<AssetExtraction>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.AssetType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.AssetId).IsRequired();
                entity.Property(e => e.VersionId).IsRequired(false);
                entity.Property(e => e.FileSha256).IsRequired().HasMaxLength(64);
                entity.Property(e => e.RawPayload).IsRequired().HasColumnType("jsonb");
                entity.Property(e => e.ExtractorVersion).IsRequired();
                entity.Property(e => e.GeometryHashVersion).IsRequired(false);
                entity.Property(e => e.SchemaVersion).IsRequired();
                entity.Property(e => e.Outcome).IsRequired();
                entity.Property(e => e.Warnings)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");
                entity.Property(e => e.ExtractedAt).IsRequired();
                entity.Property(e => e.UpdatedAt).IsRequired();

                // One row per (asset, version, file) - the idempotent upsert key.
                // NULLS NOT DISTINCT so non-versioned assets (VersionId = null) still
                // dedup on (AssetType, AssetId, FileSha256); Postgres would otherwise
                // treat every null VersionId as distinct and allow duplicate rows.
                entity.HasIndex(e => new { e.AssetType, e.AssetId, e.VersionId, e.FileSha256 })
                    .IsUnique()
                    .AreNullsDistinct(false);

                // Invalidation ("which rows are stale?") scans by extractor version.
                entity.HasIndex(e => new { e.AssetType, e.ExtractorVersion });
            });

            // Configure AssetPart - per-object scene-graph rows (sub-part findability).
            modelBuilder.Entity<AssetPart>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.AssetType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.AssetId).IsRequired();
                entity.Property(e => e.VersionId).IsRequired(false);
                entity.Property(e => e.PartPath).IsRequired().HasMaxLength(1024);
                entity.Property(e => e.Name).IsRequired().HasMaxLength(512);
                entity.Property(e => e.ParentPath).HasMaxLength(1024);
                entity.Property(e => e.Depth).IsRequired();
                entity.Property(e => e.ObjectType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.TriangleCount).IsRequired(false);
                entity.Property(e => e.VertexCount).IsRequired(false);
                entity.Property(e => e.GeometryHash).IsRequired(false).HasMaxLength(64);
                entity.Property(e => e.GeometryHashVersion).IsRequired(false);
                entity.Property(e => e.HasUvs).IsRequired(false);
                entity.Property(e => e.Detail).HasColumnType("jsonb");
                entity.Property(e => e.CreatedAt).IsRequired();

                // One row per (asset, version, part path). NULLS NOT DISTINCT so
                // non-versioned assets (null VersionId) still dedup on the part path.
                entity.HasIndex(e => new { e.AssetType, e.AssetId, e.VersionId, e.PartPath })
                    .IsUnique()
                    .AreNullsDistinct(false);

                // Fetch-by-asset (rebuild/read a whole scene graph).
                entity.HasIndex(e => new { e.AssetType, e.AssetId, e.VersionId });

                // Instance grouping + expensive-compute cache keyed on geometry hash.
                entity.HasIndex(e => e.GeometryHash);
            });

            // Configure ModelVersionAuxiliaryFile - external glTF resources (.bin/textures)
            // linked to a version with the relative path the primary .gltf references.
            modelBuilder.Entity<ModelVersionAuxiliaryFile>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.ModelVersionId).IsRequired();
                entity.Property(e => e.FileId).IsRequired();
                entity.Property(e => e.RelativePath).IsRequired().HasMaxLength(500);
                entity.Property(e => e.CreatedAt).IsRequired();

                // One row per (version, relative path) - a URI is cited once per group.
                entity.HasIndex(e => new { e.ModelVersionId, e.RelativePath }).IsUnique();

                // Removing a version drops its aux links; the shared File row survives
                // (its own cleanup runs when no entity references the hash - see IFileRepository).
                entity.HasOne(e => e.ModelVersion)
                    .WithMany()
                    .HasForeignKey(e => e.ModelVersionId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.File)
                    .WithMany()
                    .HasForeignKey(e => e.FileId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure ExtractionJob - decoupled extraction queue (mirrors ThumbnailJob).
            modelBuilder.Entity<ExtractionJob>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.AssetType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.AssetId).IsRequired();
                entity.Property(e => e.VersionId).IsRequired(false);
                entity.Property(e => e.FileSha256).IsRequired(false).HasMaxLength(64);
                entity.Property(e => e.ExtractorFamily).IsRequired().HasMaxLength(30);
                entity.Property(e => e.Operation).IsRequired(false).HasMaxLength(50);
                entity.Property(e => e.ParametersJson).IsRequired(false).HasMaxLength(4000);
                entity.Property(e => e.ResultJson).IsRequired(false).HasMaxLength(4000);
                entity.Property(e => e.Status).IsRequired();
                entity.Property(e => e.AttemptCount).IsRequired();
                entity.Property(e => e.MaxAttempts).IsRequired();
                entity.Property(e => e.ErrorMessage).HasMaxLength(2000);
                entity.Property(e => e.WarningDetail).HasMaxLength(2000);
                entity.Property(e => e.LockedBy).HasMaxLength(100);
                entity.Property(e => e.LockTimeoutMinutes).IsRequired();
                entity.Property(e => e.CreatedAt).IsRequired();
                entity.Property(e => e.UpdatedAt).IsRequired();
                entity.Property(e => e.CompletedAt).IsRequired(false);

                // Dedup: at most one live job per (asset, version, family, operation).
                // Filtered so completed/dead rows don't block re-queuing (Pending=0,
                // Processing=1). Operation is part of the key because two operations on one
                // version are two pieces of work - without it, asking to bake a model that
                // is still being unwrapped would collide with the unwrap and be rejected.
                // Nulls stay distinct, as before: adding NULLS NOT DISTINCT here would
                // change dedup for existing re-derive rows during the migration, and the
                // handler-level check already covers that path.
                entity.HasIndex(e => new { e.AssetType, e.AssetId, e.VersionId, e.ExtractorFamily, e.Operation })
                    .IsUnique()
                    .HasFilter("\"Status\" IN (0, 1)");

                // Claim scan: pull the oldest pending job within a family.
                entity.HasIndex(e => new { e.ExtractorFamily, e.Status, e.CreatedAt });
            });

            // Configure AssetDerivation - derived-signal layer (own DeriveVersion).
            modelBuilder.Entity<AssetDerivation>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.AssetType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.AssetId).IsRequired();
                entity.Property(e => e.VersionId).IsRequired(false);
                entity.Property(e => e.DeriveVersion).IsRequired();
                entity.Property(e => e.Payload).IsRequired().HasColumnType("jsonb");
                entity.Property(e => e.DerivedAt).IsRequired();
                entity.Property(e => e.UpdatedAt).IsRequired();

                // One derived row per (asset, version). NULLS NOT DISTINCT so
                // non-versioned assets (null VersionId) still dedup.
                entity.HasIndex(e => new { e.AssetType, e.AssetId, e.VersionId })
                    .IsUnique()
                    .AreNullsDistinct(false);

                // Invalidation ("which derivations are stale?") scans by derive version.
                entity.HasIndex(e => new { e.AssetType, e.DeriveVersion });
            });

            // pg_trgm powers the literal/fuzzy identifier matching in the search
            // projection (multilingual, no stemming).
            modelBuilder.HasPostgresExtension("pg_trgm");

            // Configure AssetSearchDocument - the derived-layer search projection.
            // The asset metadata schema's side table (prompt 16-B). One row per
            // (AssetType, AssetId), shared by every family - the fields here are universal
            // and arrive from a different source than the asset's bytes, so they do not
            // belong as six near-identical column sets on six aggregates.
            modelBuilder.Entity<AssetMetadata>(entity =>
            {
                entity.ToTable("AssetMetadata");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.AssetType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.AssetId).IsRequired();
                entity.Property(e => e.SchemaVersion).IsRequired();

                entity.Property(e => e.Description).IsRequired(false);
                // text[] rather than a join table: these are values, not a shared
                // vocabulary. Tags here exist only for the families whose entity has no
                // ModelTag relation (Sound, Sprite) - part D moves them to the shared pool,
                // and the schema states which home is current so nothing reads both.
                entity.Property(e => e.Tags)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");
                entity.Property(e => e.Styles)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");
                entity.Property(e => e.Themes)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");

                entity.Property(e => e.License).IsRequired(false).HasMaxLength(40);
                entity.Property(e => e.LicenseName).IsRequired(false).HasMaxLength(200);
                entity.Property(e => e.LicenseUrl).IsRequired(false).HasMaxLength(2048);
                entity.Property(e => e.Author).IsRequired(false).HasMaxLength(200);
                entity.Property(e => e.CreditName).IsRequired(false).HasMaxLength(200);
                entity.Property(e => e.CreditUrl).IsRequired(false).HasMaxLength(2048);
                entity.Property(e => e.AttributionRequired).IsRequired(false);

                entity.Property(e => e.SourceKind).IsRequired(false).HasMaxLength(40);
                entity.Property(e => e.SourceUrl).IsRequired(false).HasMaxLength(2048);
                entity.Property(e => e.StoreUrl).IsRequired(false).HasMaxLength(2048);
                entity.Property(e => e.StoreAssetId).IsRequired(false).HasMaxLength(100);
                entity.Property(e => e.StoreItemId).IsRequired(false).HasMaxLength(100);
                entity.Property(e => e.ImportedAt).IsRequired(false);

                entity.Property(e => e.FacetsJson).IsRequired(false).HasColumnType("jsonb");

                entity.Property(e => e.CreatedAt).IsRequired();
                entity.Property(e => e.UpdatedAt).IsRequired();

                // One row per asset - the read path looks a row up by this pair and the
                // write path upserts on it.
                entity.HasIndex(e => new { e.AssetType, e.AssetId }).IsUnique();

                // What a population pass scans: "which assets did this store import give
                // us", and "which of them still have no licence".
                entity.HasIndex(e => new { e.StoreUrl, e.StoreAssetId });
                entity.HasIndex(e => e.StoreItemId);
            });

            modelBuilder.Entity<AssetSearchDocument>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.AssetType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.AssetId).IsRequired();
                entity.Property(e => e.VersionId).IsRequired(false);
                entity.Property(e => e.PartPath).IsRequired(false).HasMaxLength(1024);
                entity.Property(e => e.IsCurrentVersion).IsRequired();
                entity.Property(e => e.IsActive).IsRequired().HasDefaultValue(true);
                entity.Property(e => e.Prominence).IsRequired().HasMaxLength(16);
                entity.Property(e => e.DisplayName).IsRequired().HasMaxLength(512);
                entity.Property(e => e.Tokens).IsRequired();
                entity.Property(e => e.Symbols).IsRequired();
                entity.Property(e => e.ConceptLabels).IsRequired().HasDefaultValue(string.Empty);
                entity.Property(e => e.BrowseSummary).IsRequired();
                // Authored metadata. Non-null with an empty default, like ConceptLabels:
                // the match clauses concatenate these columns directly, and a NULL would
                // make the whole expression NULL and drop the document from its tier.
                entity.Property(e => e.AuthoredTags).IsRequired().HasDefaultValue(string.Empty);
                entity.Property(e => e.Description).IsRequired().HasDefaultValue(string.Empty);
                entity.Property(e => e.TriangleCount).IsRequired(false);
                entity.Property(e => e.HasAnimations).IsRequired(false);
                entity.Property(e => e.BoneCount).IsRequired(false);
                entity.Property(e => e.ShapeClass).IsRequired(false).HasMaxLength(16);
                entity.Property(e => e.Tileability).IsRequired(false);
                entity.Property(e => e.DurationClass).IsRequired(false).HasMaxLength(16);
                entity.Property(e => e.Engine).IsRequired(false).HasMaxLength(32);
                entity.Property(e => e.GridSize).IsRequired(false);
                entity.Property(e => e.QualityFlags)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");
                // prompt-29 attribute filters + category bridge
                entity.Property(e => e.VertexCount).IsRequired(false);
                entity.Property(e => e.MaterialCount).IsRequired(false);
                entity.Property(e => e.HasUvs).IsRequired(false);
                entity.Property(e => e.UvStatus).IsRequired(false).HasMaxLength(16);
                entity.Property(e => e.PartCount).IsRequired(false);
                entity.Property(e => e.AnimationCount).IsRequired(false);
                entity.Property(e => e.MaxDimension).IsRequired(false);
                // Real-world size per axis, plus whether it can be trusted as one.
                entity.Property(e => e.DimensionX).IsRequired(false);
                entity.Property(e => e.DimensionY).IsRequired(false);
                entity.Property(e => e.DimensionZ).IsRequired(false);
                entity.Property(e => e.ScaleConvention).IsRequired(false).HasMaxLength(16);
                entity.Property(e => e.CategoryId).IsRequired(false);
                entity.Property(e => e.CategoryName).IsRequired(false).HasMaxLength(200);
                // Space-joined pack names. Generous length because an asset can sit in
                // several packs; no GIN index, matching ConceptLabels - this is a weak
                // tie-breaking signal, not a primary retrieval path.
                entity.Property(e => e.PackNames).IsRequired(false).HasMaxLength(1000);
                // SHA-256 of the asset's sorted part hashes, hex - fixed width by construction.
                entity.Property(e => e.GeometryKey).IsRequired(false).HasMaxLength(64);
                // Asset metadata schema facets, denormalised so a profile-driven search can
                // filter on them (prompt 16-F). Arrays, not space-joined text: the question
                // is containment ("is this asset Low Poly"), and a substring match over
                // joined text would answer it wrongly.
                entity.Property(e => e.Styles)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");
                entity.Property(e => e.Themes)
                    .HasColumnType("text[]")
                    .HasDefaultValueSql("'{}'::text[]");
                entity.Property(e => e.License).IsRequired(false).HasMaxLength(40);
                entity.Property(e => e.UpdatedAt).IsRequired();

                // One document per (asset, version, part). NULLS NOT DISTINCT so the
                // asset-level doc (null PartPath) and non-versioned assets still dedup.
                entity.HasIndex(e => new { e.AssetType, e.AssetId, e.VersionId, e.PartPath })
                    .IsUnique()
                    .AreNullsDistinct(false);

                // Default result gate: active + current version + prominence.
                entity.HasIndex(e => new { e.AssetType, e.IsActive, e.IsCurrentVersion, e.Prominence });

                // GIN over the facet arrays: a style filter is an array containment test,
                // which a btree cannot serve.
                entity.HasIndex(e => e.Styles).HasMethod("gin");
                entity.HasIndex(e => e.Themes).HasMethod("gin");
                entity.HasIndex(e => e.License);

                // Trigram GIN over authored identifiers - literal, multilingual, fuzzy.
                entity.HasIndex(e => e.Tokens).HasMethod("gin").HasOperators("gin_trgm_ops");
                entity.HasIndex(e => e.DisplayName).HasMethod("gin").HasOperators("gin_trgm_ops");
                entity.HasIndex(e => e.Symbols).HasMethod("gin").HasOperators("gin_trgm_ops");

                // Structural-filter btree indexes an agent composes on.
                entity.HasIndex(e => e.TriangleCount);
                entity.HasIndex(e => e.ShapeClass);
                entity.HasIndex(e => e.Engine);
                entity.HasIndex(e => e.MaxDimension);
                entity.HasIndex(e => e.CategoryId);
                // "Which assets still need unwrapping before a bake" is a whole-library
                // sweep, not a term search - it runs with no discriminating text to narrow
                // the scan first, so this one carries the query on its own.
                entity.HasIndex(e => e.UvStatus);
                // Duplicate collapsing groups the ranked page by this, and it is also how
                // "is this prop already in the library" is asked. Never a lone predicate on
                // its own, but always an equality one, so a plain btree carries it.
                entity.HasIndex(e => e.GeometryKey);
            });

            // Configure SearchLog - one row per deliberate search (from day one).
            modelBuilder.Entity<SearchLog>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Query).IsRequired().HasMaxLength(500);
                entity.Property(e => e.FiltersJson).HasColumnType("jsonb");
                entity.Property(e => e.ResultsJson).IsRequired().HasColumnType("jsonb");
                entity.Property(e => e.ResultCount).IsRequired();
                entity.Property(e => e.CreatedAt).IsRequired();
                entity.Property(e => e.OpenedAssetType).HasMaxLength(30);
                entity.Property(e => e.OpenedAssetId).IsRequired(false);
                entity.Property(e => e.OpenedAt).IsRequired(false);

                entity.HasIndex(e => e.CreatedAt);
            });

            // Configure ComputeCacheEntry - hash-keyed expensive-compute cache.
            modelBuilder.Entity<ComputeCacheEntry>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.GeometryHash).IsRequired().HasMaxLength(64);
                entity.Property(e => e.GeometryHashVersion).IsRequired();
                entity.Property(e => e.Metric).IsRequired().HasMaxLength(40);
                entity.Property(e => e.Result).IsRequired().HasColumnType("jsonb");
                entity.Property(e => e.ComputedAt).IsRequired();
                entity.Property(e => e.UpdatedAt).IsRequired();

                // One result per (hash, hash version, metric) - the cross-asset cache key.
                entity.HasIndex(e => new { e.GeometryHash, e.GeometryHashVersion, e.Metric }).IsUnique();
            });

            // Configure AssetDerivationLineage - schema hook, not yet written to.
            modelBuilder.Entity<AssetDerivationLineage>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.AssetType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.AssetId).IsRequired();
                entity.Property(e => e.SourceAssetType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.SourceAssetId).IsRequired();
                entity.Property(e => e.SourceVersionId).IsRequired(false);
                entity.Property(e => e.SourcePartPath).HasMaxLength(1024);
                entity.Property(e => e.CreatedAt).IsRequired();

                entity.HasIndex(e => new { e.AssetType, e.AssetId });
                entity.HasIndex(e => new { e.SourceAssetType, e.SourceAssetId });
            });

            // Configure AgentOperationLog - append-only audit / reversal hook.
            modelBuilder.Entity<AgentOperationLog>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.IdempotencyKey).IsRequired().HasMaxLength(200);
                entity.Property(e => e.BatchId).HasMaxLength(200);
                entity.Property(e => e.Operation).IsRequired().HasMaxLength(100);
                entity.Property(e => e.AssetType).HasMaxLength(30);
                entity.Property(e => e.AssetId).IsRequired(false);
                entity.Property(e => e.PayloadBefore).HasColumnType("jsonb");
                entity.Property(e => e.PayloadAfter).HasColumnType("jsonb");
                entity.Property(e => e.PerformedAt).IsRequired();
                entity.Property(e => e.ReversedAt).IsRequired(false);
                // Claim state: a row exists from the moment the key is reserved, so only
                // Completed means the guarded mutation actually landed.
                entity.Property(e => e.Status)
                    .IsRequired()
                    .HasMaxLength(16)
                    .HasDefaultValue(Domain.Models.AgentOperationStatus.Completed);
                entity.Property(e => e.ClaimedBy).IsRequired(false).HasMaxLength(200);
                entity.Property(e => e.Actor).IsRequired(false).HasMaxLength(100);
                entity.Property(e => e.ClaimedAt).IsRequired();
                entity.Property(e => e.CompletedAt).IsRequired(false);

                // A retried write with the same key must be a no-op - enforced here.
                entity.HasIndex(e => e.IdempotencyKey).IsUnique();
                entity.HasIndex(e => e.BatchId);
                // Sweeping abandoned Pending claims.
                entity.HasIndex(e => new { e.Status, e.ClaimedAt });
            });

            // Configure AgentUploadTicket - single-use authorisation for one remote upload.
            modelBuilder.Entity<AgentUploadTicket>(entity =>
            {
                entity.HasKey(e => e.Id);
                // Hex SHA-256; the secret itself is never stored.
                entity.Property(e => e.SecretHash).IsRequired().HasMaxLength(64);
                entity.Property(e => e.IdempotencyKey).IsRequired().HasMaxLength(200);
                entity.Property(e => e.Operation).IsRequired().HasMaxLength(100);
                entity.Property(e => e.AssetType).IsRequired().HasMaxLength(30);
                entity.Property(e => e.Actor).IsRequired(false).HasMaxLength(100);
                entity.Property(e => e.BatchId).IsRequired(false).HasMaxLength(200);
                entity.Property(e => e.IssuedAt).IsRequired();
                entity.Property(e => e.ExpiresAt).IsRequired();
                entity.Property(e => e.RedeemedAt).IsRequired(false);
                entity.Property(e => e.IsSpent).IsRequired().HasDefaultValue(false);
                entity.Property(e => e.AssetId).IsRequired(false);

                // Redemption looks a ticket up by hash on every remote upload.
                entity.HasIndex(e => e.SecretHash).IsUnique();
                // Sweeping expired tickets.
                entity.HasIndex(e => e.ExpiresAt);
            });

            base.OnModelCreating(modelBuilder);
        }
    }
}
