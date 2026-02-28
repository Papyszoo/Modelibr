using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ITextureProxyRepository
{
    Task<TextureProxy?> GetByTextureIdAndSizeAsync(int textureId, int size, CancellationToken cancellationToken = default);
    Task<IEnumerable<TextureProxy>> GetByTextureIdsAsync(IEnumerable<int> textureIds, CancellationToken cancellationToken = default);
    Task<TextureProxy> AddAsync(TextureProxy proxy, CancellationToken cancellationToken = default);
    Task<TextureProxy> UpdateAsync(TextureProxy proxy, CancellationToken cancellationToken = default);
    Task DeleteByTextureIdAsync(int textureId, CancellationToken cancellationToken = default);
}
