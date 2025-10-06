using Application.Abstractions.Repositories;
using Infrastructure.Persistence;

namespace Infrastructure.Repositories;

internal sealed class FilePersistence : IFilePersistence
{
    private readonly ApplicationDbContext _context;

    public FilePersistence(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Domain.Models.File> PersistAsync(Domain.Models.File file, CancellationToken cancellationToken = default)
    {
        // Only add if it's a new file (ID == 0)
        if (file.Id == 0)
        {
            _context.Files.Add(file);
            await _context.SaveChangesAsync(cancellationToken);
        }
        
        return file;
    }
}
