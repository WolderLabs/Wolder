using DeGA.Core;
using DeGA.Core.New;
using DeGA.CSharp.Compilation;

namespace DeGA.CSharp.Actions
{
    public record CreateClass(DotNetProjectReference Project, string ClassName, string ClassContent)
        : IActionDefinition<CreateClassAction>;

    public class CreateClassAction(DotNetProjectFactory dotNetProjectFactory, IWorkspaceFileSystem fileSystem) 
        : PipelineActionBase<CreateClass>
    {
        protected override async Task ExecuteAsync(
            PipelineActionContext context, CreateClass parameters)
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
