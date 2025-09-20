namespace Application.Abstractions.Storage;

public interface IUploadPathProvider
{
    string UploadRootPath { get; }
}