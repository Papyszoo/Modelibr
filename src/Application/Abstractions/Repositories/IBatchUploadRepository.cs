using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IBatchUploadRepository
{
    Task<BatchUpload?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<IEnumerable<BatchUpload>> GetByBatchIdAsync(string batchId, CancellationToken cancellationToken = default);
    Task<IEnumerable<BatchUpload>> GetByUploadTypeAsync(string uploadType, CancellationToken cancellationToken = default);
    Task<IEnumerable<BatchUpload>> GetByDateRangeAsync(DateTime from, DateTime to, CancellationToken cancellationToken = default);
    Task<BatchUpload?> GetByFileIdAsync(int fileId, CancellationToken cancellationToken = default);
    Task<IEnumerable<BatchUpload>> GetByModelIdAsync(int modelId, CancellationToken cancellationToken = default);
    Task AddAsync(BatchUpload batchUpload, CancellationToken cancellationToken = default);
    Task AddRangeAsync(IEnumerable<BatchUpload> batchUploads, CancellationToken cancellationToken = default);
    Task UpdateAsync(BatchUpload batchUpload, CancellationToken cancellationToken = default);
}
