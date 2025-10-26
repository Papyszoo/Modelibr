using System.Security.Cryptography;
using Application.Abstractions.Files;
using Application.Abstractions.Storage;
using Domain.Files;

namespace Infrastructure.Storage;

public sealed class HashBasedFileStorage : IFileStorage
{
    private readonly IUploadPathProvider _pathProvider;

    public HashBasedFileStorage(IUploadPathProvider pathProvider)
    {
        _pathProvider = pathProvider;
    }

    public async Task<StoredFileResult> SaveAsync(IFileUpload upload, FileType fileType, CancellationToken ct)
    {
        var root = _pathProvider.UploadRootPath;
        var tempDir = Path.Combine(root, "tmp");
        Directory.CreateDirectory(tempDir);

        var tempFile = Path.Combine(tempDir, Guid.NewGuid().ToString("N"));
        long size;

        string hashHex;
        using (var sha = SHA256.Create())
        {
            await using var tempFs = File.Create(tempFile);
            await using var crypto = new CryptoStream(tempFs, sha, CryptoStreamMode.Write);
            await upload.CopyToAsync(crypto, ct);
            crypto.FlushFinalBlock();
            size = tempFs.Length;
            hashHex = Convert.ToHexString(sha.Hash!).ToLowerInvariant();
        }

        var a = hashHex[..2];
        var b = hashHex.Substring(2, 2);
        var relativeDir = Path.Combine(a, b);
        var storedName = hashHex;
        var finalDir = Path.Combine(root, relativeDir);
        var finalPath = Path.Combine(finalDir, storedName);

        Directory.CreateDirectory(finalDir);

        if (File.Exists(finalPath))
        {
            // Duplicate content; remove temp.
            File.Delete(tempFile);
        }
        else
        {
            File.Move(tempFile, finalPath);
        }

        var relativePath = Path.Combine(relativeDir, storedName).Replace('\\', '/');
        return new StoredFileResult(relativePath, storedName, hashHex, size);
    }

    public Task DeleteFileAsync(string filePath, CancellationToken ct)
    {
        var root = _pathProvider.UploadRootPath;
        var fullPath = Path.Combine(root, filePath);
        
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }
        
        return Task.CompletedTask;
    }
}