using Wolder.Core.Files;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.Actions;

public enum DotNetSdkVersion
{
    Net8
}

public record CreateSdkGlobalParameters(DotNetSdkVersion Version);

public class CreateSdkGlobal(ISourceFiles sourceFiles, CreateSdkGlobalParameters parameters) 
    : IVoidAction<CreateSdkGlobalParameters>
{
    public async Task InvokeAsync()
    {
        _ = parameters;
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