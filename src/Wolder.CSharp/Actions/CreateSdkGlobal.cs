using Wolder.Core.Files;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.Actions;

public enum DotNetSdkVersion
{
    Net8
}

public record CreateSdkGlobal(DotNetSdkVersion Version);

[GenerateTypedActionInvokeInterface<ICreateSdkGlobal>]
public class CreateSdkGlobalAction(ISourceFiles sourceFiles, CreateSdkGlobal _) 
    : IVoidAction<CreateSdkGlobal>
{
    public async Task InvokeAsync()
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