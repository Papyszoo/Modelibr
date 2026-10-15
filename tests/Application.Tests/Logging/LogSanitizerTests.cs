using SharedKernel;
using Xunit;

namespace Application.Tests.Logging;

public class LogSanitizerTests
{
    [Fact]
    public void Sanitize_WhenValueContainsCrLfAndTab_StripsThem()
    {
        // A crafted worker id or error message could otherwise start a new log
        // line and forge entries the application never wrote (cs/log-forging).
        var forged = "worker-1\r\n[14:02:01 ERR] forged entry\tend";

        Assert.Equal("worker-1[14:02:01 ERR] forged entryend", LogSanitizer.Sanitize(forged));
    }

    [Fact]
    public void Sanitize_WhenValueIsClean_ReturnsItUnchanged()
    {
        Assert.Equal("worker-1", LogSanitizer.Sanitize("worker-1"));
    }

    [Fact]
    public void Sanitize_WhenNull_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, LogSanitizer.Sanitize(null));
    }
}
