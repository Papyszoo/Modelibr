using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Materials;

public record UpdateMaterialTagsCommand(
    int MaterialId,
    IReadOnlyCollection<string>? Tags) : ICommand<UpdateMaterialTagsResponse>;

public record UpdateMaterialTagsResponse(int MaterialId, IReadOnlyList<string> Tags);

internal sealed class UpdateMaterialTagsCommandHandler
    : ICommandHandler<UpdateMaterialTagsCommand, UpdateMaterialTagsResponse>
{
    private readonly IMaterialRepository _materialRepository;
    private readonly IModelTagRepository _modelTagRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateMaterialTagsCommandHandler(
        IMaterialRepository materialRepository,
        IModelTagRepository modelTagRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _materialRepository = materialRepository;
        _modelTagRepository = modelTagRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<UpdateMaterialTagsResponse>> Handle(
        UpdateMaterialTagsCommand command,
        CancellationToken cancellationToken)
    {
        var material = await _materialRepository.GetByIdAsync(command.MaterialId, cancellationToken);
        if (material is null)
        {
            return Result.Failure<UpdateMaterialTagsResponse>(
                new Error("MaterialNotFound", $"Material with ID {command.MaterialId} was not found."));
        }

        var now = _dateTimeProvider.UtcNow;
        var assignedTags = await MaterialTags.ResolveAsync(_modelTagRepository, command.Tags, now, cancellationToken);

        material.SetTags(assignedTags, now);
        await _materialRepository.UpdateAsync(material, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new UpdateMaterialTagsResponse(
            material.Id,
            material.Tags.Select(tag => tag.Name).OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToList()));
    }
}
