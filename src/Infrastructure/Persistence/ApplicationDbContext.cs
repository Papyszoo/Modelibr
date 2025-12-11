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
        public DbSet<Stage> Stages => Set<Stage>();
        public DbSet<Thumbnail> Thumbnails => Set<Thumbnail>();
        public DbSet<ThumbnailJob> ThumbnailJobs => Set<ThumbnailJob>();
        public DbSet<ThumbnailJobEvent> ThumbnailJobEvents => Set<ThumbnailJobEvent>();
        public DbSet<ApplicationSettings> ApplicationSettings => Set<ApplicationSettings>();
        public DbSet<Setting> Settings => Set<Setting>();
        public DbSet<BatchUpload> BatchUploads => Set<BatchUpload>();
        public DbSet<Sprite> Sprites => Set<Sprite>();
        public DbSet<SpriteCategory> SpriteCategories => Set<SpriteCategory>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Configure many-to-many relationship between Model and TextureSet (DEPRECATED - kept for backward compatibility)
            modelBuilder.Entity<Model>()
                .HasMany(m => m.TextureSets)
                .WithMany(tp => tp.Models)
                .UsingEntity(j => j.ToTable("ModelTextureSets"));

            // Configure many-to-many relationship between ModelVersion and TextureSet
            modelBuilder.Entity<ModelVersion>()
                .HasMany(mv => mv.TextureSets)
                .WithMany(ts => ts.ModelVersions)
                .UsingEntity(j => j.ToTable("ModelVersionTextureSets"));

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

            // Configure Model entity
            modelBuilder.Entity<Model>(entity =>
            {
                entity.HasKey(m => m.Id);
                entity.Property(m => m.Name).IsRequired();
                entity.Property(m => m.CreatedAt).IsRequired();
                entity.Property(m => m.UpdatedAt).IsRequired();
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

                // Add index for efficient soft delete queries
                entity.HasIndex(m => m.IsDeleted);
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

                // Create unique index on ModelId and VersionNumber
                entity.HasIndex(v => new { v.ModelId, v.VersionNumber }).IsUnique();

                // Add index for efficient soft delete queries
                entity.HasIndex(v => v.IsDeleted);

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
                entity.HasOne(v => v.Thumbnail)
                    .WithOne(t => t.ModelVersion)
                    .HasForeignKey<Thumbnail>(t => t.ModelVersionId)
                    .OnDelete(DeleteBehavior.Cascade);
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
            });

            // Configure Texture entity
            modelBuilder.Entity<Texture>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.Property(t => t.FileId).IsRequired();
                entity.Property(t => t.TextureType).IsRequired();
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
                
                // Create composite index for file and texture type to ensure uniqueness
                entity.HasIndex(t => new { t.FileId, t.TextureType }).IsUnique();

                // Create composite index to ensure unique texture type per texture set
                entity.HasIndex(t => new { t.TextureSetId, t.TextureType })
                    .IsUnique()
                    .HasFilter("\"TextureSetId\" IS NOT NULL");

                // Add index for efficient soft delete queries
                entity.HasIndex(t => t.IsDeleted);
            });

            // Configure TextureSet entity
            modelBuilder.Entity<TextureSet>(entity =>
            {
                entity.HasKey(tp => tp.Id);
                entity.Property(tp => tp.Name).IsRequired().HasMaxLength(200);
                entity.Property(tp => tp.CreatedAt).IsRequired();
                entity.Property(tp => tp.UpdatedAt).IsRequired();
                entity.Property(tp => tp.IsDeleted).IsRequired();
                entity.Property(tp => tp.DeletedAt);

                // Configure one-to-many relationship with Textures
                entity.HasMany(tp => tp.Textures)
                    .WithOne()
                    .HasForeignKey(t => t.TextureSetId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Create index for efficient querying by name
                entity.HasIndex(tp => tp.Name);

                // Add index for efficient soft delete queries
                entity.HasIndex(tp => tp.IsDeleted);
            });

            // Configure Pack entity
            modelBuilder.Entity<Pack>(entity =>
            {
                entity.HasKey(p => p.Id);
                entity.Property(p => p.Name).IsRequired().HasMaxLength(200);
                entity.Property(p => p.Description).HasMaxLength(1000);
                entity.Property(p => p.CreatedAt).IsRequired();
                entity.Property(p => p.UpdatedAt).IsRequired();

                // Create index for efficient querying by name
                entity.HasIndex(p => p.Name);
            });

            // Configure Project entity
            modelBuilder.Entity<Project>(entity =>
            {
                entity.HasKey(p => p.Id);
                entity.Property(p => p.Name).IsRequired().HasMaxLength(200);
                entity.Property(p => p.Description).HasMaxLength(1000);
                entity.Property(p => p.CreatedAt).IsRequired();
                entity.Property(p => p.UpdatedAt).IsRequired();

                // Create index for efficient querying by name
                entity.HasIndex(p => p.Name);
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
                entity.Property(t => t.ModelVersionId).IsRequired();
                entity.Property(t => t.Status).IsRequired();
                entity.Property(t => t.ThumbnailPath).HasMaxLength(500);
                entity.Property(t => t.ErrorMessage).HasMaxLength(1000);
                entity.Property(t => t.CreatedAt).IsRequired();
                entity.Property(t => t.UpdatedAt).IsRequired();

                // Create unique index for ModelVersionId to ensure one thumbnail per version
                entity.HasIndex(t => t.ModelVersionId).IsUnique();
            });

            // Configure ThumbnailJob entity
            modelBuilder.Entity<ThumbnailJob>(entity =>
            {
                entity.HasKey(tj => tj.Id);
                entity.Property(tj => tj.ModelId).IsRequired();
                entity.Property(tj => tj.ModelHash).IsRequired().HasMaxLength(64);
                entity.Property(tj => tj.Status).IsRequired();
                entity.Property(tj => tj.AttemptCount).IsRequired();
                entity.Property(tj => tj.MaxAttempts).IsRequired();
                entity.Property(tj => tj.ErrorMessage).HasMaxLength(2000);
                entity.Property(tj => tj.LockedBy).HasMaxLength(100);
                entity.Property(tj => tj.LockTimeoutMinutes).IsRequired();
                entity.Property(tj => tj.CreatedAt).IsRequired();
                entity.Property(tj => tj.UpdatedAt).IsRequired();

                // Create composite unique index for ModelHash + ModelVersionId to prevent duplicate jobs per version
                // This allows different versions to have separate thumbnail jobs even when sharing the same model file
                entity.HasIndex(tj => new { tj.ModelHash, tj.ModelVersionId }).IsUnique();
                
                // Create index for efficient job querying
                entity.HasIndex(tj => new { tj.Status, tj.CreatedAt });

                // Configure relationship with Model
                entity.HasOne(tj => tj.Model)
                    .WithMany()
                    .HasForeignKey(tj => tj.ModelId)
                    .OnDelete(DeleteBehavior.Cascade);
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
            });

            // Configure SpriteCategory entity
            modelBuilder.Entity<SpriteCategory>(entity =>
            {
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
                entity.Property(c => c.Description).HasMaxLength(500);
                entity.Property(c => c.CreatedAt).IsRequired();
                entity.Property(c => c.UpdatedAt).IsRequired();

                // Create unique index on Name
                entity.HasIndex(c => c.Name).IsUnique();
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
                "other" => FileType.Other,
                _ => FileType.Unknown
            };
        }
    }
}
