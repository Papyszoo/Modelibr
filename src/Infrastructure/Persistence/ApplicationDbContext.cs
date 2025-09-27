using Domain.Models;
using Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence
{
    public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : DbContext(options)
    {
        public DbSet<Model> Models => Set<Model>();
        public DbSet<Domain.Models.File> Files => Set<Domain.Models.File>();
        public DbSet<Texture> Textures => Set<Texture>();
        public DbSet<TexturePack> TexturePacks => Set<TexturePack>();
        public DbSet<Thumbnail> Thumbnails => Set<Thumbnail>();
        public DbSet<ThumbnailJob> ThumbnailJobs => Set<ThumbnailJob>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Configure many-to-many relationship between Model and File
            modelBuilder.Entity<Model>()
                .HasMany(m => m.Files)
                .WithMany(f => f.Models)
                .UsingEntity(j => j.ToTable("ModelFiles"));

            // Configure many-to-many relationship between Model and TexturePack
            modelBuilder.Entity<Model>()
                .HasMany(m => m.TexturePacks)
                .WithMany(tp => tp.Models)
                .UsingEntity(j => j.ToTable("ModelTexturePacks"));

            // Configure Model entity
            modelBuilder.Entity<Model>(entity =>
            {
                entity.HasKey(m => m.Id);
                entity.Property(m => m.Name).IsRequired();
                entity.Property(m => m.CreatedAt).IsRequired();
                entity.Property(m => m.UpdatedAt).IsRequired();

                // Configure one-to-one relationship with Thumbnail
                entity.HasOne(m => m.Thumbnail)
                    .WithOne(t => t.Model)
                    .HasForeignKey<Thumbnail>(t => t.ModelId)
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
                
                // Configure FileType Value Object to be stored as string
                entity.Property(f => f.FileType)
                    .HasConversion(
                        v => v.Value,
                        v => MapFromDatabaseValue(v))
                    .IsRequired();
            });

            // Configure Texture entity
            modelBuilder.Entity<Texture>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.Property(t => t.FileId).IsRequired();
                entity.Property(t => t.TextureType).IsRequired();
                entity.Property(t => t.CreatedAt).IsRequired();
                entity.Property(t => t.UpdatedAt).IsRequired();
                entity.Property(t => t.TexturePackId).IsRequired(false); // Optional relationship

                // Configure relationship with File
                entity.HasOne(t => t.File)
                    .WithMany()
                    .HasForeignKey(t => t.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Create index for efficient querying by texture type
                entity.HasIndex(t => t.TextureType);
                
                // Create composite index for file and texture type to ensure uniqueness
                entity.HasIndex(t => new { t.FileId, t.TextureType }).IsUnique();

                // Create composite index to ensure unique texture type per texture pack
                entity.HasIndex(t => new { t.TexturePackId, t.TextureType })
                    .IsUnique()
                    .HasFilter("\"TexturePackId\" IS NOT NULL");
            });

            // Configure TexturePack entity
            modelBuilder.Entity<TexturePack>(entity =>
            {
                entity.HasKey(tp => tp.Id);
                entity.Property(tp => tp.Name).IsRequired().HasMaxLength(200);
                entity.Property(tp => tp.CreatedAt).IsRequired();
                entity.Property(tp => tp.UpdatedAt).IsRequired();

                // Configure one-to-many relationship with Textures
                entity.HasMany(tp => tp.Textures)
                    .WithOne()
                    .HasForeignKey(t => t.TexturePackId)
                    .OnDelete(DeleteBehavior.SetNull);

                // Create index for efficient querying by name
                entity.HasIndex(tp => tp.Name);
            });

            // Configure Thumbnail entity
            modelBuilder.Entity<Thumbnail>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.Property(t => t.ModelId).IsRequired();
                entity.Property(t => t.Status).IsRequired();
                entity.Property(t => t.ThumbnailPath).HasMaxLength(500);
                entity.Property(t => t.ErrorMessage).HasMaxLength(1000);
                entity.Property(t => t.CreatedAt).IsRequired();
                entity.Property(t => t.UpdatedAt).IsRequired();

                // Create unique index for ModelId to ensure one thumbnail per model
                entity.HasIndex(t => t.ModelId).IsUnique();
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

                // Create unique index for ModelHash to prevent duplicate jobs
                entity.HasIndex(tj => tj.ModelHash).IsUnique();
                
                // Create index for efficient job querying
                entity.HasIndex(tj => new { tj.Status, tj.CreatedAt });

                // Configure relationship with Model
                entity.HasOne(tj => tj.Model)
                    .WithMany()
                    .HasForeignKey(tj => tj.ModelId)
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
                "other" => FileType.Other,
                _ => FileType.Unknown
            };
        }
    }
}
