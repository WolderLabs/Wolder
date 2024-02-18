using System.Collections.Immutable;
using Microsoft.CodeAnalysis;

namespace Wolder.CSharp.Compilation;

public abstract record CompilationResult(BuildOutput Output)
{
    public record Success(BuildOutput Output) 
        : CompilationResult(Output);
    public record Failure(BuildOutput Output)
        : CompilationResult(Output);
}