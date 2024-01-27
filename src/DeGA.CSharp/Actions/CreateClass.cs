using DeGA.Core.New;
using DeGA.CSharp.Compilation;

namespace DeGA.CSharp.Actions
{
    public record CreateClassParameters(DotNetProjectReference Project, string ClassName, string ClassContent)
        : IActionInputParameters;

    public class CreateClass(DotNetProjectFactory dotNetProjectFactory) 
        : PipelineActionBase<CreateClassParameters>
    {
        protected override async Task ExecuteAsync(
            PipelineActionContext context, CreateClassParameters parameters)
        {
            // TODO: Fix path
            await context.WriteFileAsync(parameters.ClassName, parameters.ClassContent);

            var project = dotNetProjectFactory.Create(parameters.Project);
            if (!(await project.TryCompileAsync()))
            {
                throw new InvalidOperationException($"Couldn't compile {project.BasePath}");
            }
        }
    }
}
