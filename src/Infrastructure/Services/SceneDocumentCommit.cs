using Application.Abstractions;
using Application.Abstractions.Services;
using Microsoft.EntityFrameworkCore;
using SharedKernel;

namespace Infrastructure.Services;

/// <inheritdoc cref="ISceneDocumentCommit"/>
internal sealed class SceneDocumentCommit : ISceneDocumentCommit
{
    private readonly IUnitOfWork _unitOfWork;

    public SceneDocumentCommit(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> SaveAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success();
        }
        catch (DbUpdateConcurrencyException)
        {
            // The UPDATE carried the revision this writer read and matched no row, so another
            // writer committed first. Reported rather than rethrown: this is an ordinary
            // outcome of two people editing one scene, and the caller's remedy - re-read and
            // apply again - is the same one the explicit expectedRevision path already gives.
            return Result.Failure(new Error(
                "Scene.RevisionConflict",
                "This scene was modified by someone else while this write was being prepared. Re-read the scene and apply the change again."));
        }
    }
}
