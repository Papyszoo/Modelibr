using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Projects;

public sealed record GetProductionNotesQuery(
    int ProjectId,
    int? LevelId = null,
    int? ReferenceImageId = null,
    int? CharacterId = null,
    bool? IsPinned = null) : IQuery<IReadOnlyList<ProductionNoteDto>>
{
    public GetProductionNotesQuery(int projectId, int? levelId, int? referenceImageId, bool? isPinned)
        : this(projectId, levelId, referenceImageId, null, isPinned)
    {
    }
}

internal sealed class GetProductionNotesQueryHandler
    : IQueryHandler<GetProductionNotesQuery, IReadOnlyList<ProductionNoteDto>>
{
    private readonly IProductionNoteRepository _notes;

    public GetProductionNotesQueryHandler(IProductionNoteRepository notes)
    {
        _notes = notes;
    }

    public async Task<Result<IReadOnlyList<ProductionNoteDto>>> Handle(
        GetProductionNotesQuery query,
        CancellationToken cancellationToken)
    {
        var notes = await _notes.GetForProjectAsync(
            query.ProjectId,
            query.LevelId,
            query.ReferenceImageId,
            query.CharacterId,
            query.IsPinned,
            cancellationToken);
        return Result.Success<IReadOnlyList<ProductionNoteDto>>(notes
            .Select(ProductionNoteView.From)
            .ToList());
    }
}

public sealed record GetProductionNoteByIdQuery(int ProjectId, int NoteId)
    : IQuery<ProductionNoteDto>;

internal sealed class GetProductionNoteByIdQueryHandler
    : IQueryHandler<GetProductionNoteByIdQuery, ProductionNoteDto>
{
    private readonly IProductionNoteRepository _notes;

    public GetProductionNoteByIdQueryHandler(IProductionNoteRepository notes)
    {
        _notes = notes;
    }

    public async Task<Result<ProductionNoteDto>> Handle(
        GetProductionNoteByIdQuery query,
        CancellationToken cancellationToken)
    {
        var note = await _notes.GetByIdAsync(query.ProjectId, query.NoteId, cancellationToken);
        return note is null
            ? Result.Failure<ProductionNoteDto>(new Error(
                "ProductionNoteNotFound",
                $"Production note {query.NoteId} was not found in project {query.ProjectId}."))
            : Result.Success(ProductionNoteView.From(note));
    }
}
