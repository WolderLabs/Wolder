namespace Wolder.CSharp.Compilation;

public interface IDotNetProjectFactory
{
    IDotNetProject Create(DotNetProjectReference reference);
}