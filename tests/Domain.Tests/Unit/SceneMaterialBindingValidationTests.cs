using Domain.Scenes;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// Document-level rules for material bindings. These hold whichever way a document
/// arrives - an agent write, an editor save, or a hand-edited JSON paste.
/// </summary>
public class SceneMaterialBindingValidationTests
{
    private static SceneDocument DocumentWith(SceneNode node) =>
        SceneDocument.Empty() with { Nodes = new[] { node } };

    private static SceneNode Node(
        SceneMaterialBinding? material = null,
        IReadOnlyList<SceneMaterialBinding>? slots = null) =>
        new("sofa", SceneTransform.Identity, new SceneAssetRef("Model", 1, 1))
        {
            Material = material,
            MaterialSlots = slots
        };

    [Fact]
    public void A_Binding_Naming_Both_Sources_Is_Rejected()
    {
        var issues = SceneDocumentValidator.Validate(
            DocumentWith(Node(new SceneMaterialBinding(TextureSetId: 3, MaterialId: 12))));

        Assert.Contains(issues, i => i.Code == "AmbiguousMaterialBinding");
    }

    [Fact]
    public void A_Binding_Naming_Only_A_Material_Is_Accepted()
    {
        var issues = SceneDocumentValidator.Validate(
            DocumentWith(Node(new SceneMaterialBinding(MaterialId: 12))));

        Assert.Empty(issues);
    }

    [Fact]
    public void A_Slot_Binding_Without_A_Slot_Name_Is_Rejected()
    {
        var issues = SceneDocumentValidator.Validate(
            DocumentWith(Node(slots: new[] { new SceneMaterialBinding(MaterialId: 12) })));

        Assert.Contains(issues, i => i.Code == "MissingMaterialSlot");
    }

    [Fact]
    public void Two_Bindings_For_One_Slot_Are_Rejected()
    {
        // No defined winner, so the scene would render one of two surfaces depending on
        // list order - the kind of thing that looks like a renderer bug for a week.
        var issues = SceneDocumentValidator.Validate(
            DocumentWith(Node(slots: new[]
            {
                new SceneMaterialBinding(MaterialId: 12, Slot: "cushions"),
                new SceneMaterialBinding(MaterialId: 13, Slot: "Cushions")
            })));

        Assert.Contains(issues, i => i.Code == "DuplicateMaterialSlot");
    }

    [Fact]
    public void A_Binding_Naming_Nothing_Is_Rejected()
    {
        var issues = SceneDocumentValidator.Validate(DocumentWith(Node(new SceneMaterialBinding())));

        Assert.Contains(issues, i => i.Code == "EmptyMaterialBinding");
    }

    [Fact]
    public void A_Nonpositive_Material_Id_Is_Rejected()
    {
        var issues = SceneDocumentValidator.Validate(
            DocumentWith(Node(new SceneMaterialBinding(MaterialId: 0))));

        Assert.Contains(issues, i => i.Code == "InvalidMaterialId");
    }

    [Fact]
    public void A_Default_Binding_And_Slot_Overrides_Coexist()
    {
        // The layering rule: the default dresses everything the overrides do not name.
        var issues = SceneDocumentValidator.Validate(
            DocumentWith(Node(
                new SceneMaterialBinding(MaterialId: 4),
                new[] { new SceneMaterialBinding(MaterialId: 7, Slot: "cushions") })));

        Assert.Empty(issues);
    }
}
