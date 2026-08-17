using System.Globalization;
using System.Reflection;
using System.Text;
using Domain.Scenes;

namespace Application.Scenes;

/// <summary>
/// Emits the TypeScript scene contract from the C# contract by reflection.
///
/// Requirement 4 of the scene rewrite is that the schema is generated from one source
/// rather than hand-mirrored into three. This is that generator: the C# record graph rooted
/// at <see cref="SceneDocument"/> is the source, and the frontend's contract file is its
/// output. <c>SceneContractTypeScriptTests</c> regenerates and compares, so a field added
/// in C# without regenerating fails the build instead of shipping an editor that silently
/// drops it.
///
/// Deliberately small: it covers the shapes the scene contract actually uses (records,
/// nullable references, <c>IReadOnlyList&lt;T&gt;</c>, doubles, ints, bools, strings) and
/// throws on anything else rather than emitting a quietly wrong <c>any</c>.
/// </summary>
public static class SceneContractTypeScript
{
    /// <summary>Path of the generated file, relative to the repository root.</summary>
    public const string OutputPath = "src/frontend/src/features/scenes/api/sceneContract.generated.ts";

    /// <summary>
    /// Properties whose C# type is <c>string</c> but whose legal values are a closed
    /// vocabulary. Emitting the union is the point: it is what makes the editor's compiler
    /// reject a light type the backend would reject at runtime.
    /// </summary>
    private static readonly Dictionary<string, string> VocabularyProperties = new(StringComparer.Ordinal)
    {
        ["SceneAssetRef.AssetType"] = "SceneAssetType",
        ["SceneLight.Type"] = "SceneLightType",
        ["ScenePrimitive.Shape"] = "ScenePrimitiveShape",
        ["SceneNode.FrontAxis"] = "SceneFrontAxis",
        ["SceneDocument.Stage"] = "SceneStage",
    };

    public static string Generate()
    {
        var builder = new StringBuilder();

        builder.AppendLine("// GENERATED FILE - DO NOT EDIT.");
        builder.AppendLine("//");
        builder.AppendLine("// Emitted from the C# scene contract (Domain/Scenes/SceneDocument.cs) by");
        builder.AppendLine("// SceneContractTypeScript. Change the C# types and regenerate; editing this file");
        builder.AppendLine("// by hand puts the editor and the server on different schemas, which is exactly");
        builder.AppendLine("// what generating it prevents. SceneContractTypeScriptTests fails the build on drift.");
        builder.AppendLine();

        builder.AppendLine("/** The only schema version this build reads or writes. */");
        builder.AppendLine($"export const SCENE_SCHEMA_VERSION = {SceneDocument.CurrentSchemaVersion}");
        builder.AppendLine();

        AppendVocabulary(builder, "SceneAssetType", SceneAssetTypes.All, "Asset families a scene node may reference.");
        AppendVocabulary(builder, "SceneLightType", SceneLightTypes.All, "Light types a scene document may contain.");
        AppendVocabulary(builder, "ScenePrimitiveShape", ScenePrimitiveShapes.All, "Blockout shapes a scene document may contain.");
        AppendVocabulary(
            builder,
            "SceneFrontAxis",
            SceneFrontAxes.All,
            "Local axes an asset's front may point along. Y is excluded: facing is a rotation about it.",
            "SCENE_FRONT_AXES");
        AppendVocabulary(
            builder,
            "SceneStage",
            SceneStages.All,
            "How far a scene has been taken, in order. Composition first, colour last - and the order is enforced, not advised.",
            "SCENE_STAGES");
        AppendVocabulary(
            builder,
            "SceneAnchorAlignment",
            SceneAnchorAlignments.All,
            "How a node is seated on the node it rests on. Decides the anchor offset a write records, and is not itself stored.",
            "SCENE_ANCHOR_ALIGNMENTS");

        foreach (var type in DiscoverTypes())
        {
            AppendInterface(builder, type);
        }

        AppendLimits(builder);

        return builder.ToString();
    }

    /// <summary>
    /// Emits a closed vocabulary as a const array plus its union type. The constant's name is
    /// the type's, pluralised - which the default handles for every vocabulary whose name
    /// takes a bare "s", and <paramref name="constantName"/> covers the ones it does not.
    /// </summary>
    private static void AppendVocabulary(
        StringBuilder builder,
        string name,
        IReadOnlyList<string> values,
        string summary,
        string? constantName = null)
    {
        constantName ??= ToScreamingSnake(name) + "S";

        builder.AppendLine($"/** {summary} */");
        builder.AppendLine($"export const {constantName} = [{string.Join(", ", values.Select(v => $"'{v}'"))}] as const");
        builder.AppendLine($"export type {name} = (typeof {constantName})[number]");
        builder.AppendLine();
    }

    private static void AppendInterface(StringBuilder builder, Type type)
    {
        builder.AppendLine($"export interface {type.Name} {{");

        var nullability = new NullabilityInfoContext();

        foreach (var property in ContractProperties(type))
        {
            var tsType = TypeScriptType(type, property, nullability);
            var optional = IsOptional(property, nullability) ? "?" : string.Empty;
            builder.AppendLine($"  {ToCamelCase(property.Name)}{optional}: {tsType}");
        }

        builder.AppendLine("}");
        builder.AppendLine();
    }

    /// <summary>
    /// The validator's numeric limits, emitted so the editor can refuse the same documents
    /// the server would - client-side validation that disagrees with the server is a form
    /// of drift too.
    /// </summary>
    private static void AppendLimits(StringBuilder builder)
    {
        // Invariant culture throughout: this emits TypeScript source, and a build machine
        // whose locale writes "0,0001" would produce a file that does not parse.
        builder.AppendLine("/** Limits the server validates against. Client-side checks must use these, not their own copies. */");
        builder.AppendLine("export const SCENE_LIMITS = {");
        builder.AppendLine($"  maxNodes: {Number(SceneDocumentValidator.MaxNodes)},");
        builder.AppendLine($"  maxLights: {Number(SceneDocumentValidator.MaxLights)},");
        builder.AppendLine($"  maxIdLength: {Number(SceneDocumentValidator.MaxIdLength)},");
        builder.AppendLine($"  minAbsScale: {Number(SceneDocumentValidator.MinAbsScale)},");
        builder.AppendLine($"  maxCoordinate: {Number(SceneDocumentValidator.MaxCoordinate)},");
        builder.AppendLine("} as const");
    }

    private static string Number(double value) => value.ToString("G", CultureInfo.InvariantCulture);

    private static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);

    /// <summary>
    /// Every contract type reachable from <see cref="SceneDocument"/>, in a stable order:
    /// the root first, then the rest alphabetically. Discovery rather than a hand-kept list
    /// so a new nested record cannot be added to the schema and left out of the emit.
    /// </summary>
    private static IReadOnlyList<Type> DiscoverTypes()
    {
        var discovered = new HashSet<Type> { typeof(SceneDocument) };
        var queue = new Queue<Type>([typeof(SceneDocument)]);

        while (queue.Count > 0)
        {
            foreach (var property in ContractProperties(queue.Dequeue()))
            {
                var candidate = Unwrap(property.PropertyType);
                if (IsContractType(candidate) && discovered.Add(candidate))
                {
                    queue.Enqueue(candidate);
                }
            }
        }

        return discovered
            .OrderBy(t => t == typeof(SceneDocument) ? 0 : 1)
            .ThenBy(t => t.Name, StringComparer.Ordinal)
            .ToList();
    }

    private static IEnumerable<PropertyInfo> ContractProperties(Type type) =>
        type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            // Records synthesise EqualityContract; it is not part of the schema.
            .Where(p => p.Name != "EqualityContract" && p.GetIndexParameters().Length == 0)
            // Only settable properties are schema. A get-only property is a computed
            // convenience (Vec3.IsFinite, and anything like it added later) - emitting it
            // would put a field in the editor's type that no document ever carries and that
            // the server would reject if one did.
            .Where(p => p.CanWrite);

    private static bool IsContractType(Type type) =>
        type.Namespace == typeof(SceneDocument).Namespace &&
        (type.IsClass || (type.IsValueType && !type.IsPrimitive && !type.IsEnum)) &&
        type != typeof(string);

    /// <summary>Strips <c>Nullable&lt;T&gt;</c> and list wrappers down to the element type.</summary>
    private static Type Unwrap(Type type)
    {
        var underlying = Nullable.GetUnderlyingType(type);
        if (underlying is not null)
        {
            return Unwrap(underlying);
        }

        if (type.IsGenericType && IsListType(type))
        {
            return Unwrap(type.GetGenericArguments()[0]);
        }

        return type;
    }

    private static bool IsListType(Type type)
    {
        var definition = type.GetGenericTypeDefinition();
        return definition == typeof(IReadOnlyList<>) || definition == typeof(IList<>) || definition == typeof(List<>);
    }

    private static string TypeScriptType(Type owner, PropertyInfo property, NullabilityInfoContext nullability)
    {
        if (VocabularyProperties.TryGetValue($"{owner.Name}.{property.Name}", out var vocabulary))
        {
            // A vocabulary short-circuits the type mapping but not the nullability: an
            // optional vocabulary property is still allowed to be absent, and emitting it as
            // non-null would have the editor's compiler insist on a value the server does not.
            return IsNullableReference(nullability.Create(property)) ? $"{vocabulary} | null" : vocabulary;
        }

        return Map(property.PropertyType, nullability.Create(property));
    }

    private static string Map(Type type, NullabilityInfo? nullability)
    {
        var underlying = Nullable.GetUnderlyingType(type);
        if (underlying is not null)
        {
            return Map(underlying, null) + " | null";
        }

        if (type.IsGenericType && IsListType(type))
        {
            var element = type.GetGenericArguments()[0];
            var elementNullability = nullability?.GenericTypeArguments.FirstOrDefault();
            return Map(element, elementNullability) + "[]";
        }

        if (type == typeof(string))
        {
            return IsNullableReference(nullability) ? "string | null" : "string";
        }

        if (type == typeof(bool))
        {
            return "boolean";
        }

        if (type == typeof(int) || type == typeof(double) || type == typeof(long) || type == typeof(float))
        {
            return "number";
        }

        if (type == typeof(DateTime))
        {
            return "string";
        }

        if (IsContractType(type))
        {
            return IsNullableReference(nullability) ? $"{type.Name} | null" : type.Name;
        }

        throw new NotSupportedException(
            $"The scene contract generator does not know how to emit '{type}'. Add a mapping rather than letting it become 'any'.");
    }

    private static bool IsNullableReference(NullabilityInfo? nullability) =>
        nullability?.ReadState == NullabilityState.Nullable;

    /// <summary>
    /// A property is optional in TypeScript when it may be absent from the JSON, which for
    /// this contract means nullable - the serializer omits nulls.
    /// </summary>
    private static bool IsOptional(PropertyInfo property, NullabilityInfoContext nullability)
    {
        if (Nullable.GetUnderlyingType(property.PropertyType) is not null)
        {
            return true;
        }

        return !property.PropertyType.IsValueType && IsNullableReference(nullability.Create(property));
    }

    private static string ToCamelCase(string value) =>
        value.Length == 0 ? value : char.ToLowerInvariant(value[0]) + value[1..];

    private static string ToScreamingSnake(string value)
    {
        var builder = new StringBuilder();
        for (var i = 0; i < value.Length; i++)
        {
            if (i > 0 && char.IsUpper(value[i]))
            {
                builder.Append('_');
            }

            builder.Append(char.ToUpperInvariant(value[i]));
        }

        return builder.ToString();
    }
}
