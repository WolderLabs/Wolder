using DeGA.Core;
using DeGA.CSharp.Actions;
using DeGA.CSharp.Compilation;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.CSharp;

public static class ServiceCollectionExtensions
{
    public static DeGAServiceBuilder AddCSharpActions(this DeGAServiceBuilder builder)
    {
        builder.Services.AddScoped<DotNetProjectFactory>();
        builder.AddAction<CreateSdkGlobal>();
        builder.AddAction<CreateClass>();
        builder.AddAction<CreateProject>();
        builder.AddAction<CompileProject>();
        
        return builder;
    }
}