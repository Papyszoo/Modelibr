using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class RemoveEnvironmentMapVariantCommandHandler : ICommandHandler<RemoveEnvironmentMapVariantCommand>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveEnvironmentMapVariantCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _environmentMapRepository = environmentMapRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(RemoveEnvironmentMapVariantCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
            if (environmentMap == null)
            {
                return Result.Failure(new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));
            }

            environmentMap.SoftDeleteVariant(command.VariantId, _dateTimeProvider.UtcNow);
            await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success();
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure(new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record RemoveEnvironmentMapVariantCommand(int EnvironmentMapId, int VariantId) : ICommand;
