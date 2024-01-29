using DeGA.Core.Files;
using DeGA.Core.Pipeline;

namespace DeGA.CSharp.Actions;

public record CreateClass(DotNetProjectReference Project, string ClassName, string ClassContent)
    : IActionDefinition<CreateClassAction>;

public class CreateClassAction(ISourceFiles sourceFiles) 
    : PipelineActionBase<CreateClass>
{
    protected override async Task ExecuteAsync(IPipelineActionContext context, CreateClass parameters)
    {
        await sourceFiles.WriteFileAsync(
            Path.Combine(parameters.Project.RelativeRoot, $"{parameters.ClassName}.cs"), 
            parameters.ClassContent);
    }
}