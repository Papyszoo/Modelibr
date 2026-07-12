using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.ScriptTemplates;

internal class CreateScriptTemplateCommandHandler : ICommandHandler<CreateScriptTemplateCommand, ScriptTemplateDto>
{
    private readonly IScriptTemplateRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public CreateScriptTemplateCommandHandler(
        IScriptTemplateRepository repository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ScriptTemplateDto>> Handle(CreateScriptTemplateCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var template = ScriptTemplate.Create(
                command.Name,
                command.Language,
                command.Content ?? string.Empty,
                _dateTimeProvider.UtcNow,
                command.Description);

            var created = await _repository.AddAsync(template, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ScriptTemplateMappings.ToDto(created));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<ScriptTemplateDto>(
                new Error("CreateScriptTemplateFailed", ex.Message));
        }
    }
}

public record CreateScriptTemplateCommand(string Name, string Language, string? Content, string? Description = null) : ICommand<ScriptTemplateDto>;
