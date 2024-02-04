using Wolder.CommandLine.Actions;
using Wolder.Core;

namespace Wolder.CommandLine;

public static class ServiceCollectionExtensions
{
    public static WolderServiceBuilder AddCommandLineActions(this WolderServiceBuilder builder)
    {
        builder.AddAction<RunCommand>();
        
        return builder;
    }
}