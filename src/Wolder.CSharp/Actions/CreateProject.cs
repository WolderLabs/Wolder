using Wolder.Core.Files;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.Actions;

public record CreateProjectParameters(DotNetProjectReference Project, string Content);

[GenerateTypedActionInvokeInterface<ICreateProject>]
public class CreateProject(ISourceFiles sourceFiles, CreateProjectParameters parameters) 
    : IVoidAction<CreateProjectParameters>
{
    public async Task InvokeAsync()
    {
        await sourceFiles.WriteFileAsync(
            parameters.Project.RelativeFilePath, parameters.Content);
    }
}