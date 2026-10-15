using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

public sealed record ProjectReferenceLinkDto(
    int Id,
    string TargetType,
    int? ProjectLevelId,
    string? ProjectLevelName,
    int? ProjectCharacterId,
    string? ProjectCharacterName);

public sealed record ProjectReferenceDto(
    int Id,
    int ProjectId,
    string Title,
    int FileId,
    string FileName,
    string PreviewUrl,
    string FileUrl,
    int SortOrder,
    IReadOnlyList<ProjectReferenceLinkDto> Links,
    IReadOnlyList<string> LevelNames,
    IReadOnlyList<string> CharacterNames);

public sealed record UpdateProjectReferenceCommand(
    int ProjectId,
    int ReferenceId,
    string? Title) : ICommand<ProjectReferenceDto>;

internal sealed class UpdateProjectReferenceCommandHandler
    : ICommandHandler<UpdateProjectReferenceCommand, ProjectReferenceDto>
{
    private readonly IProjectReferenceRepository _references;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateProjectReferenceCommandHandler(
        IProjectReferenceRepository references,
        IUnitOfWork unitOfWork)
    {
        _references = references;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectReferenceDto>> Handle(
        UpdateProjectReferenceCommand command,
        CancellationToken cancellationToken)
    {
        var reference = await _references.GetByIdAsync(
            command.ProjectId,
            command.ReferenceId,
            cancellationToken);
        if (reference is null)
            return Result.Failure<ProjectReferenceDto>(new Error(
                "ProjectReferenceNotFound",
                $"Reference image {command.ReferenceId} was not found in project {command.ProjectId}."));

        try
        {
            reference.UpdateDetails(command.Title);
            await _references.UpdateAsync(reference, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectReferenceView.From(reference));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectReferenceDto>(
                new Error("InvalidProjectReference", exception.Message));
        }
    }
}

public sealed record AddProjectReferenceLinkCommand(
    int ProjectId,
    int ReferenceId,
    int? ProjectLevelId,
    int? ProjectCharacterId) : ICommand<ProjectReferenceLinkDto>;

internal sealed class AddProjectReferenceLinkCommandHandler
    : ICommandHandler<AddProjectReferenceLinkCommand, ProjectReferenceLinkDto>
{
    private readonly IProjectLevelRepository _levels;
    private readonly IProjectCharacterRepository _characters;
    private readonly IProjectReferenceRepository _references;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddProjectReferenceLinkCommandHandler(
        IProjectLevelRepository levels,
        IProjectCharacterRepository characters,
        IProjectReferenceRepository references,
        IUnitOfWork unitOfWork,
        IDateTimeProvider dateTimeProvider)
    {
        _levels = levels;
        _characters = characters;
        _references = references;
        _unitOfWork = unitOfWork;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<ProjectReferenceLinkDto>> Handle(
        AddProjectReferenceLinkCommand command,
        CancellationToken cancellationToken)
    {
        // Request shape first: "you sent two targets" is a better answer than
        // "level 2 not found" when the caller sent a level and a character.
        if (new[] { command.ProjectLevelId, command.ProjectCharacterId }
            .Count(id => id.HasValue) != 1)
            return Result.Failure<ProjectReferenceLinkDto>(new Error(
                "InvalidProjectReferenceLink",
                "A reference link must target exactly one level or one character."));

        var reference = await _references.GetByIdAsync(
            command.ProjectId,
            command.ReferenceId,
            cancellationToken);
        if (reference is null)
            return Result.Failure<ProjectReferenceLinkDto>(new Error(
                "ProjectReferenceNotFound",
                $"Reference image {command.ReferenceId} was not found in project {command.ProjectId}."));

        if (command.ProjectLevelId is { } levelId
            && await _levels.GetByIdAsync(command.ProjectId, levelId, cancellationToken) is null)
            return Result.Failure<ProjectReferenceLinkDto>(new Error(
                "ProjectReferenceLevelNotFound",
                $"Level {levelId} was not found in project {command.ProjectId}."));

        if (command.ProjectCharacterId is { } characterId
            && await _characters.GetByIdAsync(command.ProjectId, characterId, cancellationToken) is null)
            return Result.Failure<ProjectReferenceLinkDto>(new Error(
                "ProjectReferenceCharacterNotFound",
                $"Character {characterId} was not found in project {command.ProjectId}."));

        try
        {
            var link = reference.AddLink(
                command.ProjectLevelId,
                command.ProjectCharacterId,
                _dateTimeProvider.UtcNow);
            await _references.UpdateAsync(reference, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectReferenceLinkView.From(link));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectReferenceLinkDto>(
                new Error("InvalidProjectReferenceLink", exception.Message));
        }
    }
}

public sealed record RemoveProjectReferenceLinkCommand(
    int ProjectId,
    int ReferenceId,
    int LinkId) : ICommand;

internal sealed class RemoveProjectReferenceLinkCommandHandler
    : ICommandHandler<RemoveProjectReferenceLinkCommand>
{
    private readonly IProjectReferenceRepository _references;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveProjectReferenceLinkCommandHandler(
        IProjectReferenceRepository references,
        IUnitOfWork unitOfWork)
    {
        _references = references;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(
        RemoveProjectReferenceLinkCommand command,
        CancellationToken cancellationToken)
    {
        var reference = await _references.GetByIdAsync(
            command.ProjectId,
            command.ReferenceId,
            cancellationToken);
        if (reference is null)
            return Result.Failure(new Error(
                "ProjectReferenceNotFound",
                $"Reference image {command.ReferenceId} was not found in project {command.ProjectId}."));

        if (!reference.RemoveLink(command.LinkId))
            return Result.Failure(new Error(
                "ProjectReferenceLinkNotFound",
                $"Link {command.LinkId} was not found on reference image {command.ReferenceId}."));

        await _references.UpdateAsync(reference, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

internal static class ProjectReferenceLinkView
{
    public static ProjectReferenceLinkDto From(ProjectReferenceLink link) => new(
        link.Id,
        link.TargetType,
        link.ProjectLevelId,
        link.ProjectLevel?.Name,
        link.ProjectCharacterId,
        link.ProjectCharacter?.Name);
}

internal static class ProjectReferenceView
{
    public static ProjectReferenceDto From(ProjectConceptImage reference)
    {
        var links = reference.Links
            .OrderBy(link => link.TargetType, StringComparer.Ordinal)
            .ThenBy(link => link.Id)
            .Select(ProjectReferenceLinkView.From)
            .ToList();

        return new ProjectReferenceDto(
            reference.Id,
            reference.ProjectId,
            reference.Title,
            reference.FileId,
            reference.File.OriginalFileName,
            $"/files/{reference.FileId}/preview?channel=rgb",
            $"/files/{reference.FileId}",
            reference.SortOrder,
            links,
            links.Where(link => link.ProjectLevelId.HasValue)
                .Select(link => link.ProjectLevelName ?? string.Empty)
                .Where(name => name.Length > 0)
                .ToList(),
            links.Where(link => link.ProjectCharacterId.HasValue)
                .Select(link => link.ProjectCharacterName ?? string.Empty)
                .Where(name => name.Length > 0)
                .ToList());
    }
}
