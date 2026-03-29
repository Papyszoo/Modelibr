using NWebDav.Server;
using NWebDav.Server.Props;

namespace Infrastructure.WebDav;

/// <summary>
/// Property manager for virtual generated .blend files in the WebDAV virtual file system.
/// Separate from VirtualItemPropertyManager because that one is typed for VirtualAssetFile.
/// </summary>
public sealed class VirtualGeneratedBlendPropertyManager : PropertyManager<VirtualGeneratedBlendFile>
{
    public VirtualGeneratedBlendPropertyManager()
        : base(GetProperties())
    {
    }

    private static DavProperty<VirtualGeneratedBlendFile>[] GetProperties() =>
    [
        new DavCreationDate<VirtualGeneratedBlendFile>
        {
            Getter = (_, item) => item.CreatedAt
        },
        new DavDisplayName<VirtualGeneratedBlendFile>
        {
            Getter = (_, item) => item.Name
        },
        new DavGetContentLength<VirtualGeneratedBlendFile>
        {
            Getter = (_, item) => item.SizeBytes
        },
        new DavGetContentType<VirtualGeneratedBlendFile>
        {
            Getter = (_, item) => item.MimeType
        },
        new DavGetEtag<VirtualGeneratedBlendFile>
        {
            Getter = (_, item) => $"\"{item.UniqueKey}\""
        },
        new DavGetLastModified<VirtualGeneratedBlendFile>
        {
            Getter = (_, item) => item.UpdatedAt
        },
        new DavGetResourceType<VirtualGeneratedBlendFile>
        {
            Getter = (_, _) => null
        }
    ];
}
