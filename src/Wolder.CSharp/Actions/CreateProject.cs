using Wolder.Core.Files;
using Wolder.Core.Pipeline;

namespace Wolder.CSharp.Actions;

public record CreateProject(DotNetProjectReference Project, string Content)
    : IActionDefinition<CreateProjectAction>;

public class CreateProjectAction(ISourceFiles sourceFiles) 
    : PipelineActionBase<CreateProject>
{
    protected override async Task ExecuteAsync(IPipelineActionContext context, CreateProject parameters)
    {
        await sourceFiles.WriteFileAsync(
            parameters.Project.RelativeFilePath, parameters.Content);
    }
}