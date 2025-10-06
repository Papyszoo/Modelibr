namespace Application.Abstractions.Repositories;

public interface IFilePersistence
{
    Task<Domain.Models.File> PersistAsync(Domain.Models.File file, CancellationToken cancellationToken = default);
}
