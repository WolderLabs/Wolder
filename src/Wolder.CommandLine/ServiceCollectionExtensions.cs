using Wolder.CommandLine.Actions;
using Wolder.Core;
using Wolder.Core.Workspace;

namespace Wolder.CommandLine;

public static class ServiceCollectionExtensions
{
    public static GeneratorWorkspaceBuilder AddCommandLineActions(this GeneratorWorkspaceBuilder builder)
    {
        builder.AddAction<RunCommand>();
        
        return builder;
    }
}