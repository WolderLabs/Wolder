using Wolder.Core.Workspace;

namespace Wolder.Interactive.Web;

public static class GeneratorWorkspaceBuilderExtensions
{
    public static GeneratorWorkspaceBuilder AddInteractiveWebServer(this GeneratorWorkspaceBuilder builder)
    {
        builder.RegisterWorkspaceStateDelegate();
        return builder;
    }
}