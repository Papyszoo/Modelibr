namespace SharedKernel;

/// <summary>
/// Neutralizes characters that let a caller-supplied value forge extra log lines
/// (CodeQL cs/log-forging). CR, LF and TAB are stripped; everything else is
/// left as-is.
///
/// Shared by every layer that logs worker- or request-supplied values: the
/// command handlers in Application, the queue in Infrastructure and the
/// SignalR notification service in WebApi.
/// </summary>
public static class LogSanitizer
{
    public static string Sanitize(string? input) =>
        input?.Replace("\n", "").Replace("\r", "").Replace("\t", "") ?? string.Empty;
}
