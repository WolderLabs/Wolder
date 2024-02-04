
namespace Wolder.CSharp;

public readonly record struct DotNetProjectReference(string RelativeFilePath)
{
    public string RelativeRoot => Path.GetDirectoryName(RelativeFilePath)!;
    public string Name => Path.GetFileNameWithoutExtension(RelativeFilePath)!;
}