using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IProductionNoteRepository
{
    Task<ProductionNote> AddAsync(ProductionNote note, CancellationToken cancellationToken = default);
    Task<ProductionNote?> GetByIdAsync(int projectId, int noteId, CancellationToken cancellationToken = default);
    Task<IEnumerable<ProductionNote>> GetForProjectAsync(
        int projectId,
        int? levelId = null,
        int? referenceImageId = null,
        bool? isPinned = null,
        CancellationToken cancellationToken = default);
    Task UpdateAsync(ProductionNote note, CancellationToken cancellationToken = default);
    Task DeleteAsync(ProductionNote note, CancellationToken cancellationToken = default);
}
