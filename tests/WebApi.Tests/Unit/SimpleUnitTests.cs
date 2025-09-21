using Xunit;

namespace WebApi.Tests.Unit;

public class SimpleUnitTests
{
    [Fact]
    public void SimpleTest_ShouldPass()
    {
        // Arrange
        var expected = 42;
        
        // Act
        var actual = 40 + 2;
        
        // Assert
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData(1, 1, 2)]
    [InlineData(2, 3, 5)]
    [InlineData(-1, 1, 0)]
    public void Add_ShouldReturnCorrectSum(int a, int b, int expected)
    {
        // Act
        var result = a + b;
        
        // Assert
        Assert.Equal(expected, result);
    }
}