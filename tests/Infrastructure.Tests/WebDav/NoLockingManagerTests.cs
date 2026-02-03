using Infrastructure.WebDav;
using NWebDav.Server;
using NWebDav.Server.Locking;
using NWebDav.Server.Stores;
using Xunit;

namespace Infrastructure.Tests.WebDav;

public class NoLockingManagerTests
{
    private readonly NoLockingManager _lockingManager;

    public NoLockingManagerTests()
    {
        _lockingManager = new NoLockingManager();
    }

    [Fact]
    public void Lock_ReturnsForbidden()
    {
        // Arrange
        var mockItem = new TestStoreItem();
        var owner = new System.Xml.Linq.XElement("owner");
        var lockRootUri = new Uri("http://localhost/dav/test");

        // Act
        var result = _lockingManager.Lock(mockItem, LockType.Write, LockScope.Exclusive, owner, lockRootUri, false, new[] { 3600 });

        // Assert
        Assert.Equal(DavStatusCode.Forbidden, result.Result);
        Assert.Null(result.Lock);
    }

    [Fact]
    public void Unlock_ReturnsNoContent()
    {
        // Arrange
        var mockItem = new TestStoreItem();
        var token = new Uri("urn:lock:1234");

        // Act
        var result = _lockingManager.Unlock(mockItem, token);

        // Assert
        Assert.Equal(DavStatusCode.NoContent, result);
    }

    [Fact]
    public void RefreshLock_ReturnsPreconditionFailed()
    {
        // Arrange
        var mockItem = new TestStoreItem();
        var lockTokenUri = new Uri("urn:lock:1234");

        // Act
        var result = _lockingManager.RefreshLock(mockItem, false, new[] { 3600 }, lockTokenUri);

        // Assert
        Assert.Equal(DavStatusCode.PreconditionFailed, result.Result);
    }

    [Fact]
    public void GetActiveLockInfo_ReturnsEmptyEnumerable()
    {
        // Arrange
        var mockItem = new TestStoreItem();

        // Act
        var result = _lockingManager.GetActiveLockInfo(mockItem);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public void GetSupportedLocks_ReturnsEmptyEnumerable()
    {
        // Arrange
        var mockItem = new TestStoreItem();

        // Act
        var result = _lockingManager.GetSupportedLocks(mockItem);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public void IsLocked_ReturnsFalse()
    {
        // Arrange
        var mockItem = new TestStoreItem();

        // Act
        var result = _lockingManager.IsLocked(mockItem);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public void HasLock_ReturnsFalse()
    {
        // Arrange
        var mockItem = new TestStoreItem();
        var lockToken = new Uri("urn:lock:1234");

        // Act
        var result = _lockingManager.HasLock(mockItem, lockToken);

        // Assert
        Assert.False(result);
    }

    private class TestStoreItem : IStoreItem
    {
        public string Name => "test";
        public string UniqueKey => "test:1";
        public NWebDav.Server.Props.IPropertyManager PropertyManager => null!;
        public ILockingManager LockingManager => null!;

        public Task<Stream> GetReadableStreamAsync(NWebDav.Server.Http.IHttpContext httpContext)
            => Task.FromResult(Stream.Null);

        public Task<DavStatusCode> UploadFromStreamAsync(NWebDav.Server.Http.IHttpContext httpContext, Stream source)
            => Task.FromResult(DavStatusCode.Forbidden);

        public Task<StoreItemResult> CopyAsync(IStoreCollection destination, string name, bool overwrite, NWebDav.Server.Http.IHttpContext httpContext)
            => Task.FromResult(new StoreItemResult(DavStatusCode.Forbidden));
    }
}
