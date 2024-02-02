using System.Collections.Immutable;
using Microsoft.CodeAnalysis;

namespace DeGA.CSharp.Compilation;

public abstract record CompilationResult(ImmutableArray<Diagnostic> Diagnostics)
{
    public record Success(ImmutableArray<Diagnostic> Diagnostics) 
        : CompilationResult(Diagnostics);
    public record Failure(ImmutableArray<Diagnostic> Diagnostics)
        : CompilationResult(Diagnostics);
}