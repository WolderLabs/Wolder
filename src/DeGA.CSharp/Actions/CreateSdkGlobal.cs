using DeGA.Core.Files;
using DeGA.Core.Pipeline;

namespace DeGA.CSharp.Actions;

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