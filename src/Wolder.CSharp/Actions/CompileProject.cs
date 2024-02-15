using Wolder.Core.Files;
using Wolder.Core.Workspace;
using Wolder.CSharp.Compilation;

namespace Wolder.CSharp.Actions;

public record CompileProjectParameters(DotNetProjectReference Project);

public class CompileProject(
    DotNetProjectFactory dotNetProjectFactory, CompileProjectParameters parameters) 
    : IAction<CompileProjectParameters, CompilationResult>
{
    public async Task<CompilationResult> InvokeAsync()
    {
        var project = dotNetProjectFactory.Create(parameters.Project);
        var result = await project.TryCompileAsync();
        return result;
    }
}