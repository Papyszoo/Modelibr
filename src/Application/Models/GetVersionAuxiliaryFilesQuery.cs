using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Models;

/// <summary>
/// Returns the auxiliary (external) files linked to a model version — the <c>.bin</c>
/// buffers and textures a loose <c>.gltf</c> references, each with the relative path the
/// primary references it by. The worker uses this to resolve the glTF's external URIs
/// against already-uploaded files (no network fetch).
/// </summary>
internal class GetVersionAuxiliaryFilesQueryHandler
    : IQueryHandler<GetVersionAuxiliaryFilesQuery, GetVersionAuxiliaryFilesResponse>
{
    private readonly IModelVersionAuxiliaryFileRepository _auxiliaryRepository;

    public GetVersionAuxiliaryFilesQueryHandler(IModelVersionAuxiliaryFileRepository auxiliaryRepository)
    {
        _auxiliaryRepository = auxiliaryRepository;
    }

    public async Task<Result<GetVersionAuxiliaryFilesResponse>> Handle(
        GetVersionAuxiliaryFilesQuery query,
        CancellationToken cancellationToken)
    {
        var auxiliaries = await _auxiliaryRepository.GetForVersionAsync(query.ModelVersionId, cancellationToken);

        var items = auxiliaries
            .Select(a => new AuxiliaryFileDescriptor(
                a.FileId,
                a.RelativePath,
                a.File.OriginalFileName,
                a.File.Sha256Hash,
                a.File.SizeBytes))
            .ToList();

        return Result.Success(new GetVersionAuxiliaryFilesResponse(query.ModelVersionId, items));
    }
}

public record GetVersionAuxiliaryFilesQuery(int ModelVersionId) : IQuery<GetVersionAuxiliaryFilesResponse>;

public record GetVersionAuxiliaryFilesResponse(int ModelVersionId, IReadOnlyList<AuxiliaryFileDescriptor> Auxiliaries);

public record AuxiliaryFileDescriptor(int FileId, string RelativePath, string OriginalFileName, string Sha256Hash, long SizeBytes);
