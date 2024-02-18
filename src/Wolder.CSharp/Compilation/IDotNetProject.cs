namespace Wolder.CSharp.Compilation;

public interface IDotNetProject
{
    Task<CompilationResult> TryCompileAsync();
}