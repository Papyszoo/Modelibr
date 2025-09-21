using Domain.Models;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence
{
    public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : DbContext(options)
    {
        public DbSet<Model> Models => Set<Model>();
        public DbSet<Domain.Models.File> Files => Set<Domain.Models.File>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Configure many-to-many relationship between Model and File
            modelBuilder.Entity<Model>()
                .HasMany(m => m.Files)
                .WithMany(f => f.Models)
                .UsingEntity(j => j.ToTable("ModelFiles"));

            // Configure File entity
            modelBuilder.Entity<Domain.Models.File>(entity =>
            {
                entity.HasKey(f => f.Id);
                entity.Property(f => f.OriginalFileName).IsRequired();
                entity.Property(f => f.StoredFileName).IsRequired();
                entity.Property(f => f.FilePath).IsRequired();
                entity.Property(f => f.MimeType).IsRequired();
                entity.Property(f => f.Sha256Hash).IsRequired();
                entity.Property(f => f.FileType).IsRequired();
            });

            base.OnModelCreating(modelBuilder);
        }
    }
}
