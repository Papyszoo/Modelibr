using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

public sealed record ProjectCharacterImageDto(
    int Id,
    int? FileId,
    string? FileName,
    string? Title,
    string? Caption,
    string? PreviewUrl,
    string? FileUrl,
    int SortOrder);

public sealed record ProjectCharacterModelDto(
    int Id,
    int? ModelId,
    string? ModelName,
    string? Label,
    int SortOrder);

public sealed record CharacterAbilityDto(
    int Id,
    string Name,
    string? Description,
    int SortOrder);

public sealed record CharacterVariantDto(
    int Id,
    string Name,
    string? Description,
    int? ProjectLevelId,
    string? ProjectLevelName,
    int SortOrder);

public sealed record ProjectCharacterDto(
    int Id,
    int ProjectId,
    string Name,
    string? Description,
    IReadOnlyList<string> Tags,
    IReadOnlyList<ProjectCharacterImageDto> Images,
    IReadOnlyList<ProjectCharacterModelDto> Models,
    IReadOnlyList<CharacterAbilityDto> Abilities,
    IReadOnlyList<CharacterVariantDto> Variants,
    int ImageCount,
    int ModelCount,
    int AbilityCount,
    int VariantCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record CreateProjectCharacterCommand(
    int ProjectId,
    string Name,
    string? Description,
    IReadOnlyList<string>? Tags = null) : ICommand<ProjectCharacterDto>;

public sealed record UpdateProjectCharacterCommand(
    int ProjectId,
    int CharacterId,
    string Name,
    string? Description,
    IReadOnlyList<string>? Tags = null) : ICommand<ProjectCharacterDto>;

public sealed record DeleteProjectCharacterCommand(int ProjectId, int CharacterId) : ICommand;

public sealed record AddProjectCharacterImageCommand(
    int ProjectId,
    int CharacterId,
    int FileId,
    string? Title = null,
    string? Caption = null,
    int? SortOrder = null) : ICommand<ProjectCharacterImageDto>;

public sealed record UpdateProjectCharacterImageCommand(
    int ProjectId,
    int CharacterId,
    int ImageId,
    string? Title,
    string? Caption,
    int? SortOrder = null) : ICommand<ProjectCharacterImageDto>;

public sealed record RemoveProjectCharacterImageCommand(
    int ProjectId,
    int CharacterId,
    int ImageId) : ICommand;

public sealed record AddProjectCharacterModelCommand(
    int ProjectId,
    int CharacterId,
    int ModelId,
    string? Label = null,
    int? SortOrder = null) : ICommand<ProjectCharacterModelDto>;

public sealed record UpdateProjectCharacterModelCommand(
    int ProjectId,
    int CharacterId,
    int ModelLinkId,
    string? Label,
    int? SortOrder = null) : ICommand<ProjectCharacterModelDto>;

public sealed record RemoveProjectCharacterModelCommand(
    int ProjectId,
    int CharacterId,
    int ModelLinkId) : ICommand;

public sealed record AddCharacterAbilityCommand(
    int ProjectId,
    int CharacterId,
    string Name,
    string? Description = null,
    int? SortOrder = null) : ICommand<CharacterAbilityDto>;

public sealed record UpdateCharacterAbilityCommand(
    int ProjectId,
    int CharacterId,
    int AbilityId,
    string Name,
    string? Description,
    int? SortOrder = null) : ICommand<CharacterAbilityDto>;

public sealed record RemoveCharacterAbilityCommand(
    int ProjectId,
    int CharacterId,
    int AbilityId) : ICommand;

public sealed record AddCharacterVariantCommand(
    int ProjectId,
    int CharacterId,
    string Name,
    string? Description = null,
    int? ProjectLevelId = null,
    int? SortOrder = null) : ICommand<CharacterVariantDto>;

public sealed record UpdateCharacterVariantCommand(
    int ProjectId,
    int CharacterId,
    int VariantId,
    string Name,
    string? Description,
    int? ProjectLevelId,
    int? SortOrder = null) : ICommand<CharacterVariantDto>;

public sealed record RemoveCharacterVariantCommand(
    int ProjectId,
    int CharacterId,
    int VariantId) : ICommand;

internal sealed class CreateProjectCharacterCommandHandler
    : ICommandHandler<CreateProjectCharacterCommand, ProjectCharacterDto>
{
    private readonly IProjectRepository _projects;
    private readonly IProjectCharacterRepository _characters;
    private readonly IProjectCharacterTagRepository _tags;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public CreateProjectCharacterCommandHandler(
        IProjectRepository projects,
        IProjectCharacterRepository characters,
        IProjectCharacterTagRepository tags,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _projects = projects;
        _characters = characters;
        _tags = tags;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectCharacterDto>> Handle(
        CreateProjectCharacterCommand command,
        CancellationToken cancellationToken)
    {
        if (await _projects.GetByIdAsync(command.ProjectId, cancellationToken) is null)
            return Result.Failure<ProjectCharacterDto>(new Error(
                "ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));

        try
        {
            var now = _clock.UtcNow;
            var tags = await _tags.GetOrCreateAsync(command.ProjectId, command.Tags, now, cancellationToken);
            var character = ProjectCharacter.Create(command.ProjectId, command.Name, command.Description, now, tags);
            await _characters.AddAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.From(character));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectCharacterDto>(new Error("InvalidProjectCharacter", exception.Message));
        }
    }
}

internal sealed class UpdateProjectCharacterCommandHandler
    : ICommandHandler<UpdateProjectCharacterCommand, ProjectCharacterDto>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IProjectCharacterTagRepository _tags;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateProjectCharacterCommandHandler(
        IProjectCharacterRepository characters,
        IProjectCharacterTagRepository tags,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _tags = tags;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectCharacterDto>> Handle(
        UpdateProjectCharacterCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure<ProjectCharacterDto>(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        try
        {
            var now = _clock.UtcNow;
            var tags = await _tags.GetOrCreateAsync(command.ProjectId, command.Tags, now, cancellationToken);
            character.Update(command.Name, command.Description, tags, now);
            await _characters.UpdateAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.From(character));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectCharacterDto>(new Error("InvalidProjectCharacter", exception.Message));
        }
    }
}

internal sealed class DeleteProjectCharacterCommandHandler : ICommandHandler<DeleteProjectCharacterCommand>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteProjectCharacterCommandHandler(
        IProjectCharacterRepository characters,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(
        DeleteProjectCharacterCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        await _characters.DeleteAsync(character, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

internal sealed class AddProjectCharacterImageCommandHandler
    : ICommandHandler<AddProjectCharacterImageCommand, ProjectCharacterImageDto>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IFileRepository _files;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public AddProjectCharacterImageCommandHandler(
        IProjectCharacterRepository characters,
        IFileRepository files,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _files = files;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectCharacterImageDto>> Handle(
        AddProjectCharacterImageCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure<ProjectCharacterImageDto>(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        var file = await _files.GetByIdAsync(command.FileId, cancellationToken);
        if (file is null)
            return Result.Failure<ProjectCharacterImageDto>(new Error(
                "FileNotFound", $"File with ID {command.FileId} was not found."));

        try
        {
            var now = _clock.UtcNow;
            var image = character.AddImage(
                file,
                command.Title,
                command.Caption,
                command.SortOrder ?? character.Images.Count,
                now);
            await _characters.UpdateAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.ImageFrom(image));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectCharacterImageDto>(new Error("InvalidProjectCharacterImage", exception.Message));
        }
    }
}

internal sealed class UpdateProjectCharacterImageCommandHandler
    : ICommandHandler<UpdateProjectCharacterImageCommand, ProjectCharacterImageDto>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateProjectCharacterImageCommandHandler(
        IProjectCharacterRepository characters,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectCharacterImageDto>> Handle(
        UpdateProjectCharacterImageCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure<ProjectCharacterImageDto>(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        var image = character.Images.FirstOrDefault(candidate => candidate.Id == command.ImageId);
        if (image is null)
            return Result.Failure<ProjectCharacterImageDto>(new Error(
                "ProjectCharacterImageNotFound", $"Character image {command.ImageId} was not found on character {command.CharacterId}."));

        try
        {
            image.UpdateDetails(command.Title, command.Caption, command.SortOrder);
            character.Touch(_clock.UtcNow);
            await _characters.UpdateAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.ImageFrom(image));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectCharacterImageDto>(new Error("InvalidProjectCharacterImage", exception.Message));
        }
    }
}

internal sealed class RemoveProjectCharacterImageCommandHandler : ICommandHandler<RemoveProjectCharacterImageCommand>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveProjectCharacterImageCommandHandler(
        IProjectCharacterRepository characters,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(
        RemoveProjectCharacterImageCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));
        if (!character.RemoveImage(command.ImageId))
            return Result.Failure(new Error(
                "ProjectCharacterImageNotFound", $"Character image {command.ImageId} was not found on character {command.CharacterId}."));

        await _characters.UpdateAsync(character, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

internal sealed class AddProjectCharacterModelCommandHandler
    : ICommandHandler<AddProjectCharacterModelCommand, ProjectCharacterModelDto>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IModelRepository _models;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public AddProjectCharacterModelCommandHandler(
        IProjectCharacterRepository characters,
        IModelRepository models,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _models = models;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectCharacterModelDto>> Handle(
        AddProjectCharacterModelCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure<ProjectCharacterModelDto>(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        var model = await _models.GetByIdForAssociationAsync(command.ModelId, cancellationToken);
        if (model is null)
            return Result.Failure<ProjectCharacterModelDto>(new Error(
                "ModelNotFound", $"Model with ID {command.ModelId} was not found."));

        try
        {
            var now = _clock.UtcNow;
            var link = character.AddModel(model, command.Label, command.SortOrder ?? character.Models.Count, now);
            await _characters.UpdateAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.ModelFrom(link));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectCharacterModelDto>(new Error("InvalidProjectCharacterModel", exception.Message));
        }
    }
}

internal sealed class UpdateProjectCharacterModelCommandHandler
    : ICommandHandler<UpdateProjectCharacterModelCommand, ProjectCharacterModelDto>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateProjectCharacterModelCommandHandler(
        IProjectCharacterRepository characters,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectCharacterModelDto>> Handle(
        UpdateProjectCharacterModelCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure<ProjectCharacterModelDto>(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        var link = character.Models.FirstOrDefault(candidate => candidate.Id == command.ModelLinkId);
        if (link is null)
            return Result.Failure<ProjectCharacterModelDto>(new Error(
                "ProjectCharacterModelNotFound", $"Character model link {command.ModelLinkId} was not found on character {command.CharacterId}."));

        try
        {
            link.UpdateDetails(command.Label, command.SortOrder);
            character.Touch(_clock.UtcNow);
            await _characters.UpdateAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.ModelFrom(link));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectCharacterModelDto>(new Error("InvalidProjectCharacterModel", exception.Message));
        }
    }
}

internal sealed class RemoveProjectCharacterModelCommandHandler : ICommandHandler<RemoveProjectCharacterModelCommand>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveProjectCharacterModelCommandHandler(
        IProjectCharacterRepository characters,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(
        RemoveProjectCharacterModelCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));
        if (!character.RemoveModel(command.ModelLinkId))
            return Result.Failure(new Error(
                "ProjectCharacterModelNotFound", $"Character model link {command.ModelLinkId} was not found on character {command.CharacterId}."));

        await _characters.UpdateAsync(character, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

internal sealed class AddCharacterAbilityCommandHandler
    : ICommandHandler<AddCharacterAbilityCommand, CharacterAbilityDto>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public AddCharacterAbilityCommandHandler(
        IProjectCharacterRepository characters,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CharacterAbilityDto>> Handle(
        AddCharacterAbilityCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure<CharacterAbilityDto>(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        try
        {
            var now = _clock.UtcNow;
            var ability = character.AddAbility(command.Name, command.Description, command.SortOrder ?? character.Abilities.Count, now);
            await _characters.UpdateAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.AbilityFrom(ability));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<CharacterAbilityDto>(new Error("InvalidCharacterAbility", exception.Message));
        }
    }
}

internal sealed class UpdateCharacterAbilityCommandHandler
    : ICommandHandler<UpdateCharacterAbilityCommand, CharacterAbilityDto>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateCharacterAbilityCommandHandler(
        IProjectCharacterRepository characters,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CharacterAbilityDto>> Handle(
        UpdateCharacterAbilityCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure<CharacterAbilityDto>(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        var ability = character.Abilities.FirstOrDefault(candidate => candidate.Id == command.AbilityId);
        if (ability is null)
            return Result.Failure<CharacterAbilityDto>(new Error(
                "CharacterAbilityNotFound", $"Ability {command.AbilityId} was not found on character {command.CharacterId}."));

        try
        {
            ability.UpdateDetails(command.Name, command.Description, command.SortOrder);
            character.Touch(_clock.UtcNow);
            await _characters.UpdateAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.AbilityFrom(ability));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<CharacterAbilityDto>(new Error("InvalidCharacterAbility", exception.Message));
        }
    }
}

internal sealed class RemoveCharacterAbilityCommandHandler : ICommandHandler<RemoveCharacterAbilityCommand>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveCharacterAbilityCommandHandler(
        IProjectCharacterRepository characters,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(
        RemoveCharacterAbilityCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));
        if (!character.RemoveAbility(command.AbilityId))
            return Result.Failure(new Error(
                "CharacterAbilityNotFound", $"Ability {command.AbilityId} was not found on character {command.CharacterId}."));

        await _characters.UpdateAsync(character, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

internal sealed class AddCharacterVariantCommandHandler
    : ICommandHandler<AddCharacterVariantCommand, CharacterVariantDto>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IProjectLevelRepository _levels;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public AddCharacterVariantCommandHandler(
        IProjectCharacterRepository characters,
        IProjectLevelRepository levels,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _levels = levels;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CharacterVariantDto>> Handle(
        AddCharacterVariantCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure<CharacterVariantDto>(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        ProjectLevel? level = null;
        if (command.ProjectLevelId is { } levelId)
        {
            level = await _levels.GetByIdAsync(command.ProjectId, levelId, cancellationToken);
            if (level is null)
                return Result.Failure<CharacterVariantDto>(new Error(
                    "ProjectLevelNotFound", $"Level {levelId} was not found in project {command.ProjectId}."));
        }

        try
        {
            var now = _clock.UtcNow;
            var variant = character.AddVariant(
                command.Name,
                command.Description,
                command.ProjectLevelId,
                command.SortOrder ?? character.Variants.Count,
                now);
            await _characters.UpdateAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.VariantFrom(variant, level?.Name));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<CharacterVariantDto>(new Error("InvalidCharacterVariant", exception.Message));
        }
    }
}

internal sealed class UpdateCharacterVariantCommandHandler
    : ICommandHandler<UpdateCharacterVariantCommand, CharacterVariantDto>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IProjectLevelRepository _levels;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateCharacterVariantCommandHandler(
        IProjectCharacterRepository characters,
        IProjectLevelRepository levels,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _levels = levels;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CharacterVariantDto>> Handle(
        UpdateCharacterVariantCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure<CharacterVariantDto>(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));

        var variant = character.Variants.FirstOrDefault(candidate => candidate.Id == command.VariantId);
        if (variant is null)
            return Result.Failure<CharacterVariantDto>(new Error(
                "CharacterVariantNotFound", $"Variant {command.VariantId} was not found on character {command.CharacterId}."));

        ProjectLevel? level = null;
        if (command.ProjectLevelId is { } levelId)
        {
            level = await _levels.GetByIdAsync(command.ProjectId, levelId, cancellationToken);
            if (level is null)
                return Result.Failure<CharacterVariantDto>(new Error(
                    "ProjectLevelNotFound", $"Level {levelId} was not found in project {command.ProjectId}."));
        }

        try
        {
            variant.UpdateDetails(
                command.Name,
                command.Description,
                command.ProjectLevelId,
                command.SortOrder);
            character.Touch(_clock.UtcNow);
            await _characters.UpdateAsync(character, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCharacterView.VariantFrom(variant, level?.Name));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<CharacterVariantDto>(new Error("InvalidCharacterVariant", exception.Message));
        }
    }
}

internal sealed class RemoveCharacterVariantCommandHandler : ICommandHandler<RemoveCharacterVariantCommand>
{
    private readonly IProjectCharacterRepository _characters;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveCharacterVariantCommandHandler(
        IProjectCharacterRepository characters,
        IUnitOfWork unitOfWork)
    {
        _characters = characters;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(
        RemoveCharacterVariantCommand command,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(command.ProjectId, command.CharacterId, cancellationToken);
        if (character is null)
            return Result.Failure(new Error(
                "ProjectCharacterNotFound", $"Character {command.CharacterId} was not found in project {command.ProjectId}."));
        if (!character.RemoveVariant(command.VariantId))
            return Result.Failure(new Error(
                "CharacterVariantNotFound", $"Variant {command.VariantId} was not found on character {command.CharacterId}."));

        await _characters.UpdateAsync(character, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

internal static class ProjectCharacterView
{
    public static ProjectCharacterDto From(ProjectCharacter character) => new(
        character.Id,
        character.ProjectId,
        character.Name,
        character.Description,
        character.Tags.OrderBy(tag => tag.Name).Select(tag => tag.Name).ToList(),
        character.Images.OrderBy(image => image.SortOrder).ThenBy(image => image.Id).Select(ImageFrom).ToList(),
        character.Models.OrderBy(model => model.SortOrder).ThenBy(model => model.Id).Select(ModelFrom).ToList(),
        character.Abilities.OrderBy(ability => ability.SortOrder).ThenBy(ability => ability.Id).Select(AbilityFrom).ToList(),
        character.Variants.OrderBy(variant => variant.SortOrder).ThenBy(variant => variant.Id)
            .Select(variant => VariantFrom(variant, variant.ProjectLevel?.Name)).ToList(),
        character.Images.Count,
        character.Models.Count,
        character.Abilities.Count,
        character.Variants.Count,
        character.CreatedAt,
        character.UpdatedAt);

    public static ProjectCharacterImageDto ImageFrom(ProjectCharacterImage image) => new(
        image.Id,
        image.FileId,
        image.File?.OriginalFileName,
        image.Title,
        image.Caption,
        image.FileId is { } fileIdForPreview ? $"/files/{fileIdForPreview}/preview?channel=rgb" : null,
        image.FileId is { } fileIdForFile ? $"/files/{fileIdForFile}" : null,
        image.SortOrder);

    public static ProjectCharacterModelDto ModelFrom(ProjectCharacterModel link) => new(
        link.Id,
        link.ModelId,
        link.Model?.Name,
        link.Label,
        link.SortOrder);

    public static CharacterAbilityDto AbilityFrom(CharacterAbility ability) => new(
        ability.Id,
        ability.Name,
        ability.Description,
        ability.SortOrder);

    public static CharacterVariantDto VariantFrom(CharacterVariant variant, string? levelName = null) => new(
        variant.Id,
        variant.Name,
        variant.Description,
        variant.ProjectLevelId,
        levelName,
        variant.SortOrder);
}
