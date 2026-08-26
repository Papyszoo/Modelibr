using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Materials;

/// <summary>Recycle-bin delete. Nothing is removed until a hard delete asks for it.</summary>
public record SoftDeleteMaterialCommand(int Id) : ICommand<SoftDeleteMaterialResponse>;

public record SoftDeleteMaterialResponse(int Id, string Name);

internal sealed class SoftDeleteMaterialCommandHandler
    : ICommandHandler<SoftDeleteMaterialCommand, SoftDeleteMaterialResponse>
{
    private readonly IMaterialRepository _materialRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public SoftDeleteMaterialCommandHandler(
        IMaterialRepository materialRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _materialRepository = materialRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<SoftDeleteMaterialResponse>> Handle(
        SoftDeleteMaterialCommand command,
        CancellationToken cancellationToken)
    {
        var material = await _materialRepository.GetByIdAsync(command.Id, cancellationToken);
        if (material is null)
        {
            return Result.Failure<SoftDeleteMaterialResponse>(
                new Error("MaterialNotFound", $"Material with ID {command.Id} was not found."));
        }

        material.SoftDelete(_dateTimeProvider.UtcNow);
        await _materialRepository.UpdateAsync(material, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new SoftDeleteMaterialResponse(material.Id, material.Name));
    }
}

public record RestoreMaterialCommand(int Id) : ICommand<RestoreMaterialResponse>;

public record RestoreMaterialResponse(int Id, string Name);

internal sealed class RestoreMaterialCommandHandler
    : ICommandHandler<RestoreMaterialCommand, RestoreMaterialResponse>
{
    private readonly IMaterialRepository _materialRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public RestoreMaterialCommandHandler(
        IMaterialRepository materialRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _materialRepository = materialRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<RestoreMaterialResponse>> Handle(
        RestoreMaterialCommand command,
        CancellationToken cancellationToken)
    {
        var material = await _materialRepository.GetDeletedByIdAsync(command.Id, cancellationToken);
        if (material is null)
        {
            return Result.Failure<RestoreMaterialResponse>(
                new Error("MaterialNotFound", $"Recycled material with ID {command.Id} was not found."));
        }

        material.Restore(_dateTimeProvider.UtcNow);
        await _materialRepository.UpdateAsync(material, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new RestoreMaterialResponse(material.Id, material.Name));
    }
}
