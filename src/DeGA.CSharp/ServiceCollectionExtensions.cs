using DeGA.Core;
using DeGA.CSharp.Actions;

namespace DeGA.CSharp;

public static class ServiceCollectionExtensions
{
    public static DeGAServiceBuilder AddCSharpActions(this DeGAServiceBuilder builder)
    {
        builder.AddAction<CreateClass>();
        builder.AddAction<CreateProject>();
        
        return builder;
    }
}