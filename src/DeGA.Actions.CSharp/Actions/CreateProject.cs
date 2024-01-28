using DeGA.Core.New;
using DeGA.CSharp.Compilation;

namespace DeGA.CSharp.Actions;

public record CreateProject(DotNetProjectReference project, string content)
    : IActionDefinition<CreateProjectAction>;

public class CreateProjectAction : PipelineActionBase<CreateProject>
{
    protected override Task ExecuteAsync(PipelineActionContext context, CreateProject parameters)
    {
        return Task.CompletedTask;
    }
}