using Wolder.CommandLine.Actions;
using Wolder.Core;

namespace Wolder.CommandLine;

public static class ServiceCollectionExtensions
{
    public static DeGAServiceBuilder AddCommandLineActions(this DeGAServiceBuilder builder)
    {
        builder.AddAction<RunCommand>();
        
        return builder;
    }
}