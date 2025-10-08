using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Infrastructure;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        
        // Use a dummy connection string for design-time operations
        optionsBuilder.UseNpgsql("Host=localhost;Database=Modelibr;Username=postgres;Password=postgres");
        
        return new ApplicationDbContext(optionsBuilder.Options);
    }
}
