
namespace DeGA.CSharp;

public readonly record struct DotNetProjectReference(string RelativeFilePath)
{
    public string RelativeRoot => Path.GetDirectoryName(RelativeFilePath)!;
}