using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Vfx;

/// <summary>Hard delete. An effect has no recycle bin.</summary>
public record DeleteVfxCommand(int Id) : ICommand<DeleteVfxResponse>;

public record DeleteVfxResponse(int Id, string Name);

internal sealed class DeleteVfxCommandHandler : ICommandHandler<DeleteVfxCommand, DeleteVfxResponse>
{
    private readonly IVfxRepository _vfxRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteVfxCommandHandler(IVfxRepository vfxRepository, IUnitOfWork unitOfWork)
    {
        _vfxRepository = vfxRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<DeleteVfxResponse>> Handle(
        DeleteVfxCommand command,
        CancellationToken cancellationToken)
    {
        var vfx = await _vfxRepository.GetByIdAsync(command.Id, cancellationToken);
        if (vfx is null)
        {
            return Result.Failure<DeleteVfxResponse>(
                new Error("VfxNotFound", $"Vfx with ID {command.Id} was not found."));
        }

        await _vfxRepository.DeleteAsync(command.Id, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new DeleteVfxResponse(vfx.Id, vfx.Name));
    }
}
