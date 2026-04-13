namespace Application.Categories;

internal static class HierarchicalCategoryHelpers
{
    internal static string BuildPath<TCategory>(
        TCategory category,
        IReadOnlyList<TCategory> categories,
        Func<TCategory, int> getId,
        Func<TCategory, int?> getParentId,
        Func<TCategory, string> getName)
    {
        var segments = new Stack<string>();
        var current = category;

        while (current != null)
        {
            segments.Push(getName(current));
            var parentId = getParentId(current);
            current = parentId.HasValue
                ? categories.FirstOrDefault(c => getId(c) == parentId.Value)
                : default;
        }

        return string.Join(" / ", segments);
    }

    internal static bool IsDescendant<TCategory>(
        int categoryId,
        int proposedParentId,
        IReadOnlyList<TCategory> categories,
        Func<TCategory, int> getId,
        Func<TCategory, int?> getParentId)
    {
        var current = categories.FirstOrDefault(c => getId(c) == proposedParentId);
        while (current != null)
        {
            if (getParentId(current) == categoryId)
                return true;

            var parentId = getParentId(current);
            current = parentId.HasValue
                ? categories.FirstOrDefault(c => getId(c) == parentId.Value)
                : default;
        }

        return false;
    }
}
