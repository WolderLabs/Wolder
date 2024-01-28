using DeGA.Actions.CSharp.Compilation;
using DeGA.Core.New;

namespace DeGA.Actions.CSharp.Actions;

public record CreateProject(DotNetProjectReference project, string content)
    : IActionDefinition<CreateProjectAction>;

public class CreateProjectAction : PipelineActionBase<CreateProject>
{
    protected override Task ExecuteAsync(PipelineActionContext context, CreateProject parameters)
    {
        return Task.CompletedTask;
    }
}