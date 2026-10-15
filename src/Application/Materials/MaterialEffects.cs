using Domain.ValueObjects;
using SharedKernel;

namespace Application.Materials;

/// <summary>
/// The command-side glue for a caller-supplied effects document. <see cref="Error"/> carries
/// no field paths, so a rejection folds every problem into its message - the caller gets the
/// whole list to fix in one round rather than one typo per turn.
/// </summary>
public static class MaterialEffects
{
    public static Error InvalidError(IReadOnlyList<MaterialEffectsProblem> problems)
    {
        var summary = string.Join("; ", problems.Select(problem => $"{problem.Path} {problem.Message}"));

        return new Error(
            "InvalidMaterialEffects",
            $"The material effects were rejected ({problems.Count} problem{(problems.Count == 1 ? "" : "s")}): {summary}");
    }
}
