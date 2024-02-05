using Wolder.Core.Files;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.Actions;

public enum DotNetSdkVersion
{
    Net8
}

public record CreateSdkGlobal(DotNetSdkVersion Version)
    : IActionDefinition<CreateSdkGlobalAction>;

public class CreateSdkGlobalAction(ISourceFiles sourceFiles) 
    : PipelineActionBase<CreateSdkGlobal>
{
    protected override async Task ExecuteAsync(IPipelineActionContext context, CreateSdkGlobal parameters)
    {
        await sourceFiles.WriteFileAsync(
            "global.json",
            """
            {
              "sdk": {
                "version": "8.0.0",
                "rollForward": "latestFeature"
              }
            }
            """);
    }
}