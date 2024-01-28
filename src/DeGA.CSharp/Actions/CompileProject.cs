using DeGA.Core.Files;
using DeGA.Core.Pipeline;
using DeGA.CSharp.Compilation;

namespace DeGA.CSharp.Actions;

public record CompileProject(DotNetProjectReference Project)
    : IActionDefinition<CompileProjectAction>;

public class CompileProjectAction(DotNetProjectFactory dotNetProjectFactory, IWorkspaceFileSystem fileSystem) 
    : PipelineActionBase<CompileProject>
{
    protected override async Task ExecuteAsync(PipelineActionContext _, CompileProject parameters)
    {
        var project = dotNetProjectFactory.Create(parameters.Project);
        if (!(await project.TryCompileAsync()))
        {
            throw new InvalidOperationException($"Couldn't compile {project.BasePath}");
        }
    }
}