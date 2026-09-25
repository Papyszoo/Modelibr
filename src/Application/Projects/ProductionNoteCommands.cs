using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

public sealed record ProductionNoteDto(
    int Id,
    int ProjectId,
    int? LevelId,
    int? ReferenceImageId,
    string Title,
    string Body,
    bool IsPinned,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record CreateProductionNoteCommand(
    int ProjectId,
    int? LevelId,
    int? ReferenceImageId,
    string Title,
    string Body,
    bool IsPinned) : ICommand<ProductionNoteDto>;

public sealed record UpdateProductionNoteCommand(
    int ProjectId,
    int NoteId,
    int? LevelId,
    int? ReferenceImageId,
    string Title,
    string Body,
    bool IsPinned) : ICommand<ProductionNoteDto>;

public sealed record DeleteProductionNoteCommand(int ProjectId, int NoteId) : ICommand;

internal sealed class CreateProductionNoteCommandHandler
    : ICommandHandler<CreateProductionNoteCommand, ProductionNoteDto>
{
    private readonly IProjectRepository _projects;
    private readonly IProjectLevelRepository _levels;
    private readonly IProjectReferenceRepository _references;
    private readonly IProductionNoteRepository _notes;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public CreateProductionNoteCommandHandler(
        IProjectRepository projects,
        IProjectLevelRepository levels,
        IProjectReferenceRepository references,
        IProductionNoteRepository notes,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _projects = projects;
        _levels = levels;
        _references = references;
        _notes = notes;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProductionNoteDto>> Handle(
        CreateProductionNoteCommand command,
        CancellationToken cancellationToken)
    {
        if (await _projects.GetByIdAsync(command.ProjectId, cancellationToken) is null)
            return Result.Failure<ProductionNoteDto>(new Error(
                "ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));

        var targetError = await ProductionNoteTargetGuard.ValidateAsync(
            command.ProjectId,
            command.LevelId,
            command.ReferenceImageId,
            _levels,
            _references,
            cancellationToken);
        if (targetError is not null)
            return Result.Failure<ProductionNoteDto>(targetError);

        try
        {
            var note = ProductionNote.Create(
                command.ProjectId,
                command.LevelId,
                command.ReferenceImageId,
                command.Title,
                command.Body,
                command.IsPinned,
                _clock.UtcNow);
            await _notes.AddAsync(note, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProductionNoteView.From(note));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProductionNoteDto>(
                new Error("InvalidProductionNote", exception.Message));
        }
    }
}

internal sealed class UpdateProductionNoteCommandHandler
    : ICommandHandler<UpdateProductionNoteCommand, ProductionNoteDto>
{
    private readonly IProjectLevelRepository _levels;
    private readonly IProjectReferenceRepository _references;
    private readonly IProductionNoteRepository _notes;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateProductionNoteCommandHandler(
        IProjectLevelRepository levels,
        IProjectReferenceRepository references,
        IProductionNoteRepository notes,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _levels = levels;
        _references = references;
        _notes = notes;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProductionNoteDto>> Handle(
        UpdateProductionNoteCommand command,
        CancellationToken cancellationToken)
    {
        var note = await _notes.GetByIdAsync(command.ProjectId, command.NoteId, cancellationToken);
        if (note is null)
            return Result.Failure<ProductionNoteDto>(new Error(
                "ProductionNoteNotFound",
                $"Production note {command.NoteId} was not found in project {command.ProjectId}."));

        var targetError = await ProductionNoteTargetGuard.ValidateAsync(
            command.ProjectId,
            command.LevelId,
            command.ReferenceImageId,
            _levels,
            _references,
            cancellationToken);
        if (targetError is not null)
            return Result.Failure<ProductionNoteDto>(targetError);

        try
        {
            note.Update(
                command.LevelId,
                command.ReferenceImageId,
                command.Title,
                command.Body,
                command.IsPinned,
                _clock.UtcNow);
            await _notes.UpdateAsync(note, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProductionNoteView.From(note));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProductionNoteDto>(
                new Error("InvalidProductionNote", exception.Message));
        }
    }
}

internal sealed class DeleteProductionNoteCommandHandler
    : ICommandHandler<DeleteProductionNoteCommand>
{
    private readonly IProductionNoteRepository _notes;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteProductionNoteCommandHandler(
        IProductionNoteRepository notes,
        IUnitOfWork unitOfWork)
    {
        _notes = notes;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(
        DeleteProductionNoteCommand command,
        CancellationToken cancellationToken)
    {
        var note = await _notes.GetByIdAsync(command.ProjectId, command.NoteId, cancellationToken);
        if (note is null)
            return Result.Failure(new Error(
                "ProductionNoteNotFound",
                $"Production note {command.NoteId} was not found in project {command.ProjectId}."));

        await _notes.DeleteAsync(note, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

internal static class ProductionNoteView
{
    public static ProductionNoteDto From(ProductionNote note) => new(
        note.Id,
        note.ProjectId,
        note.LevelId,
        note.ReferenceImageId,
        note.Title,
        note.Body,
        note.IsPinned,
        note.CreatedAt,
        note.UpdatedAt);
}

internal static class ProductionNoteTargetGuard
{
    public static async Task<Error?> ValidateAsync(
        int projectId,
        int? levelId,
        int? referenceImageId,
        IProjectLevelRepository levels,
        IProjectReferenceRepository references,
        CancellationToken cancellationToken)
    {
        if (levelId.HasValue && referenceImageId.HasValue)
            return new Error(
                "ProductionNoteTargetConflict",
                "A production note can target either a level or a reference image, not both.");

        if (levelId is { } level && await levels.GetByIdAsync(projectId, level, cancellationToken) is null)
            return new Error(
                "ProductionNoteLevelNotFound",
                $"Level {level} was not found in project {projectId}.");

        if (referenceImageId is { } reference
            && await references.GetByIdAsync(projectId, reference, cancellationToken) is null)
            return new Error(
                "ProductionNoteReferenceNotFound",
                $"Reference image {reference} was not found in project {projectId}.");

        return null;
    }
}
