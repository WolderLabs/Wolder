using DeGA.CommandLine.Actions;
using DeGA.Core;

namespace DeGA.CommandLine;

public static class ServiceCollectionExtensions
{
    public static DeGAServiceBuilder AddCommandLineActions(this DeGAServiceBuilder builder)
    {
        builder.AddAction<RunCommand>();
        
        return builder;
    }
}