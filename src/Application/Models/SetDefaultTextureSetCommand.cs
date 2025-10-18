using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models
{
    public record SetDefaultTextureSetCommand(int ModelId, int? TextureSetId) : ICommand<SetDefaultTextureSetResponse>;

    public record SetDefaultTextureSetResponse(int ModelId, int? DefaultTextureSetId);

    internal class SetDefaultTextureSetCommandHandler : ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>
    {
        private readonly IModelRepository _modelRepository;
        private readonly IDateTimeProvider _dateTimeProvider;

        public SetDefaultTextureSetCommandHandler(
            IModelRepository modelRepository,
            IDateTimeProvider dateTimeProvider)
        {
            _modelRepository = modelRepository;
            _dateTimeProvider = dateTimeProvider;
        }

        public async Task<Result<SetDefaultTextureSetResponse>> Handle(SetDefaultTextureSetCommand command, CancellationToken cancellationToken)
        {
            var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);

            if (model == null)
            {
                return Result.Failure<SetDefaultTextureSetResponse>(
                    new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
            }

            try
            {
                model.SetDefaultTextureSet(command.TextureSetId, _dateTimeProvider.UtcNow);
                await _modelRepository.UpdateAsync(model, cancellationToken);

                return Result.Success(new SetDefaultTextureSetResponse(model.Id, model.DefaultTextureSetId));
            }
            catch (InvalidOperationException ex)
            {
                return Result.Failure<SetDefaultTextureSetResponse>(
                    new Error("InvalidTextureSet", ex.Message));
            }
        }
    }
}
