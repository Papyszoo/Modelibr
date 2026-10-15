namespace Application.Abstractions.Repositories;

public interface IVfxRepository
{
    Task<Domain.Models.Vfx> AddAsync(Domain.Models.Vfx vfx, CancellationToken cancellationToken = default);
    Task<IEnumerable<Domain.Models.Vfx>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<Domain.Models.Vfx?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Domain.Models.Vfx> UpdateAsync(Domain.Models.Vfx vfx, CancellationToken cancellationToken = default);

    /// <summary>Hard delete. An effect has no recycle bin.</summary>
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
