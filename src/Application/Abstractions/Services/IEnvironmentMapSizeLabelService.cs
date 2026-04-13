using Domain.Models;
using DomainFile = Domain.Models.File;
using SharedKernel;

namespace Application.Abstractions.Services;

public interface IEnvironmentMapSizeLabelService
{
    Task<Result<string>> InferSizeLabelAsync(
        IReadOnlyCollection<DomainFile> files,
        EnvironmentMapProjectionType projectionType,
        CancellationToken cancellationToken = default);
}
