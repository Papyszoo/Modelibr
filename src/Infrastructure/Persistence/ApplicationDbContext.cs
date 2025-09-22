using Domain.Models;
using Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence
{
    public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : DbContext(options)
    {
        public DbSet<Model> Models => Set<Model>();
        public DbSet<Domain.Models.File> Files => Set<Domain.Models.File>();
        public DbSet<Thumbnail> Thumbnails => Set<Thumbnail>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Configure many-to-many relationship between Model and File
            modelBuilder.Entity<Model>()
                .HasMany(m => m.Files)
                .WithMany(f => f.Models)
                .UsingEntity(j => j.ToTable("ModelFiles"));

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
