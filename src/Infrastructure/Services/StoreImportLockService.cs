using System.Security.Cryptography;
using System.Text;
using Application.Abstractions.Services;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Services;

public class StoreImportLockService : IStoreImportLockService
{
    private readonly ApplicationDbContext _context;

    public StoreImportLockService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task AcquireLockAsync(string key, CancellationToken cancellationToken = default)
    {
        if (_context.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("AcquireLockAsync requires an active database transaction.");
        }

        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(key));
        var lockId = BitConverter.ToInt64(hashBytes, 0);

        await _context.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock({0});",
            new object[] { lockId },
            cancellationToken);
    }
}
