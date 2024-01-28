using DeGA.Core.Files;
using DeGA.Core.Pipeline;
using DeGA.CSharp.Compilation;

namespace DeGA.CSharp.Actions;

public record CreateClass(DotNetProjectReference Project, string ClassName, string ClassContent)
    : IActionDefinition<CreateClassAction>;

public class CreateClassAction(DotNetProjectFactory dotNetProjectFactory, IWorkspaceFileSystem fileSystem) 
    : PipelineActionBase<CreateClass>
{
    protected override async Task ExecuteAsync(PipelineActionContext context, CreateClass parameters)
    {
        await context.WriteFileAsync(
            Path.Combine(parameters.Project.RelativeFilePath, $"{parameters.ClassName}.cs"), 
            parameters.ClassContent);
    }
}