
namespace Wolder.CSharp;

public record DotNetProjectReference(string RelativeFilePath, string BaseNamespace)
{
    public string RelativeRoot => Path.GetDirectoryName(RelativeFilePath)!;
    public string Name => Path.GetFileNameWithoutExtension(RelativeFilePath)!;
}