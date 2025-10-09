using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal sealed class UpdateModelTagsCommandHandler 
    : ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateModelTagsCommandHandler(
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateModelTagsResponse>> Handle(
        UpdateModelTagsCommand command,
        CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);

        if (model is null)
        {
            return Result.Failure<UpdateModelTagsResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        var now = _dateTimeProvider.UtcNow;
        model.SetTagsAndDescription(command.Tags, command.Description, now);

        await _modelRepository.UpdateAsync(model, cancellationToken);

        return Result.Success(new UpdateModelTagsResponse(
            model.Id,
            model.Tags,
            model.Description
        ));
    }
}
