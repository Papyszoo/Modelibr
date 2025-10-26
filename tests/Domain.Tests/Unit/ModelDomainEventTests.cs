using Domain.Events;
using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class ModelDomainEventTests
{
    [Fact]
    public void RaiseModelUploadedEvent_ValidParameters_RaisesEvent()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var modelHash = "abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234";
        var versionId = 1;

        // Act
        model.RaiseModelUploadedEvent(versionId, modelHash, true);

        // Assert
        Assert.Single(model.DomainEvents);
        var domainEvent = model.DomainEvents.First();
        Assert.IsType<ModelUploadedEvent>(domainEvent);
        
        var uploadedEvent = (ModelUploadedEvent)domainEvent;
        Assert.Equal(model.Id, uploadedEvent.ModelId);
        Assert.Equal(versionId, uploadedEvent.ModelVersionId);
        Assert.Equal(modelHash, uploadedEvent.ModelHash);
        Assert.True(uploadedEvent.IsNewModel);
    }

    [Fact]
    public void RaiseModelUploadedEvent_NullHash_ThrowsException()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);

        // Act & Assert
        Assert.Throws<ArgumentException>(() => 
            model.RaiseModelUploadedEvent(1, null!, true));
    }

    [Fact]
    public void RaiseModelUploadedEvent_EmptyHash_ThrowsException()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);

        // Act & Assert
        Assert.Throws<ArgumentException>(() => 
            model.RaiseModelUploadedEvent(1, "", true));
    }

    [Fact]
    public void ClearDomainEvents_WithRaisedEvents_ClearsEvents()
    {
        // Arrange
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var modelHash = "abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234";
        model.RaiseModelUploadedEvent(1, modelHash, true);

        // Act
        model.ClearDomainEvents();

        // Assert
        Assert.Empty(model.DomainEvents);
    }
}