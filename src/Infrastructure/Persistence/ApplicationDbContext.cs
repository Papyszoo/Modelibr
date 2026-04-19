using Domain.Models;
using Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence
{
    public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : DbContext(options)
    {
        public DbSet<Model> Models => Set<Model>();
        public DbSet<ModelVersion> ModelVersions => Set<ModelVersion>();
        public DbSet<Domain.Models.File> Files => Set<Domain.Models.File>();
        public DbSet<Texture> Textures => Set<Texture>();
        public DbSet<TextureSet> TextureSets => Set<TextureSet>();
        public DbSet<Pack> Packs => Set<Pack>();
        public DbSet<Project> Projects => Set<Project>();
        public DbSet<ModelCategory> ModelCategories => Set<ModelCategory>();
        public DbSet<TextureSetCategory> TextureSetCategories => Set<TextureSetCategory>();
        public DbSet<ModelTag> ModelTags => Set<ModelTag>();
        public DbSet<ModelConceptImage> ModelConceptImages => Set<ModelConceptImage>();
        public DbSet<ProjectConceptImage> ProjectConceptImages => Set<ProjectConceptImage>();
        public DbSet<Stage> Stages => Set<Stage>();
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
        public DbSet<EnvironmentMapCategory> EnvironmentMapCategories => Set<EnvironmentMapCategory>();
        public DbSet<EnvironmentMap> EnvironmentMaps => Set<EnvironmentMap>();
        public DbSet<EnvironmentMapVariant> EnvironmentMapVariants => Set<EnvironmentMapVariant>();
        public DbSet<EnvironmentMapVariantFaceFile> EnvironmentMapVariantFaceFiles => Set<EnvironmentMapVariantFaceFile>();
        public DbSet<TextureProxy> TextureProxies => Set<TextureProxy>();
        public DbSet<ModelVersionTextureSet> ModelVersionTextureSets => Set<ModelVersionTextureSet>();

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
                entity.Property(v => v.TechnicalDetailsUpdatedAt).IsRequired(false);

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
                
                // Configure FileType Value Object to be stored as string
                entity.Property(f => f.FileType)
                    .HasConversion(
                        v => v.Value,
                        v => MapFromDatabaseValue(v))
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

                // Create index for efficient querying by name
                entity.HasIndex(p => p.Name);
                entity.HasIndex(p => p.LicenseType);
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
                entity.Property(c => c.CreatedAt).IsRequired();
                entity.Property(c => c.UpdatedAt).IsRequired();

                entity.HasOne(c => c.Parent)
                    .WithMany(c => c.Children)
                    .HasForeignKey(c => c.ParentId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(c => new { c.ParentId, c.Name }).IsUnique();
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
                entity.Property(s => s.ThumbnailCameraVerticalAngle).IsRequired();
                entity.Property(s => s.ThumbnailWidth).IsRequired();
                entity.Property(s => s.ThumbnailHeight).IsRequired();
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
                entity.Property(s => s.CreatedAt).IsRequired();
                entity.Property(s => s.UpdatedAt).IsRequired();
                entity.Property(s => s.IsDeleted).IsRequired();
                entity.Property(s => s.DeletedAt);

                // Configure relationship with File
                entity.HasOne(s => s.File)
                    .WithMany()
                    .HasForeignKey(s => s.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

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
                entity.Property(s => s.CreatedAt).IsRequired();
                entity.Property(s => s.UpdatedAt).IsRequired();
                entity.Property(s => s.IsDeleted).IsRequired();
                entity.Property(s => s.DeletedAt);

                // Configure relationship with File
                entity.HasOne(s => s.File)
                    .WithMany()
                    .HasForeignKey(s => s.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

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

            base.OnModelCreating(modelBuilder);
        }

        private static FileType MapFromDatabaseValue(string value)
        {
            return value switch
            {
                "obj" => FileType.Obj,
                "fbx" => FileType.Fbx,
                "gltf" => FileType.Gltf,
                "glb" => FileType.Glb,
                "blend" => FileType.Blend,
                "max" => FileType.Max,
                "maya" => FileType.Maya,
                "texture" => FileType.Texture,
                "material" => FileType.Material,
                "sprite" => FileType.Sprite,
                "spritesheet" => FileType.SpriteSheet,
                "gif" => FileType.Gif,
                "apng" => FileType.Apng,
                "webp" => FileType.WebP,
                "mp3" => FileType.Mp3,
                "wav" => FileType.Wav,
                "ogg" => FileType.Ogg,
                "flac" => FileType.Flac,
                "aac" => FileType.Aac,
                "m4a" => FileType.M4a,
                "hdr" => FileType.Hdr,
                "other" => FileType.Other,
                _ => FileType.Unknown
            };
        }
    }
}
