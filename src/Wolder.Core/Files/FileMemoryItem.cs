namespace Wolder.Core.Files;

public record FileMemoryItem(string RelativePath, string Content) : IMemoryItem
{
    public string ToPromptText()
    {
        return $"""
                BEGIN FILE: {RelativePath}
                ```
                {Content}
                ```
                END FILE: {RelativePath}
                """;
    }
}