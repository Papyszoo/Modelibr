using System.Xml.Linq;
using NWebDav.Server;
using NWebDav.Server.Props;

namespace Infrastructure.WebDav;

/// <summary>
/// Property manager for virtual collections (folders) in the WebDAV virtual file system.
/// </summary>
public sealed class VirtualCollectionPropertyManager : PropertyManager<VirtualCollectionBase>
{
    public VirtualCollectionPropertyManager()
        : base(GetProperties())
    {
    }

    private static DavProperty<VirtualCollectionBase>[] GetProperties() =>
    [
        new DavCreationDate<VirtualCollectionBase>
        {
            Getter = (_, _) => DateTime.UtcNow
        },
        new DavDisplayName<VirtualCollectionBase>
        {
            Getter = (_, item) => item.Name
        },
        new DavGetLastModified<VirtualCollectionBase>
        {
            Getter = (_, _) => DateTime.UtcNow
        },
        new DavGetResourceType<VirtualCollectionBase>
        {
            Getter = (_, _) => new XElement[] { new XElement(WebDavNamespaces.DavNs + "collection") }
        }
    ];
}
