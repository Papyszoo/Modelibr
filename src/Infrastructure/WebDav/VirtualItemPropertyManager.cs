using NWebDav.Server;
using NWebDav.Server.Props;

namespace Infrastructure.WebDav;

/// <summary>
/// Property manager for virtual asset files in the WebDAV virtual file system.
/// </summary>
public sealed class VirtualItemPropertyManager : PropertyManager<VirtualAssetFile>
{
    public VirtualItemPropertyManager()
        : base(GetProperties())
    {
    }

    private static DavProperty<VirtualAssetFile>[] GetProperties() =>
    [
        new DavCreationDate<VirtualAssetFile>
        {
            Getter = (_, item) => item.CreatedAt
        },
        new DavDisplayName<VirtualAssetFile>
        {
            Getter = (_, item) => item.Name
        },
        new DavGetContentLength<VirtualAssetFile>
        {
            Getter = (_, item) => item.SizeBytes
        },
        new DavGetContentType<VirtualAssetFile>
        {
            Getter = (_, item) => item.MimeType
        },
        new DavGetEtag<VirtualAssetFile>
        {
            Getter = (_, item) => $"\"{item.Sha256Hash}\""
        },
        new DavGetLastModified<VirtualAssetFile>
        {
            Getter = (_, item) => item.UpdatedAt
        },
        new DavGetResourceType<VirtualAssetFile>
        {
            Getter = (_, _) => null
        }
    ];
}
