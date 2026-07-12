using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.ScriptTemplates;

internal class UpdateScriptTemplateCommandHandler : ICommandHandler<UpdateScriptTemplateCommand, ScriptTemplateDto>
{
    private readonly IScriptTemplateRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateScriptTemplateCommandHandler(
        IScriptTemplateRepository repository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ScriptTemplateDto>> Handle(UpdateScriptTemplateCommand command, CancellationToken cancellationToken)
    {
        var template = await _repository.GetByIdAsync(command.Id, cancellationToken);
        if (template == null)
        {
            return Result.Failure<ScriptTemplateDto>(
                new Error("ScriptTemplateNotFound", $"Script template with ID {command.Id} was not found."));
        }

        try
        {
            template.Update(
                command.Name,
                command.Language,
                command.Content ?? string.Empty,
                _dateTimeProvider.UtcNow,
                command.Description);

            var saved = await _repository.UpdateAsync(template, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ScriptTemplateMappings.ToDto(saved));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<ScriptTemplateDto>(
                new Error("UpdateScriptTemplateFailed", ex.Message));
        }
    }
}

public record UpdateScriptTemplateCommand(int Id, string Name, string Language, string? Content, string? Description = null) : ICommand<ScriptTemplateDto>;
