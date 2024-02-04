using Wolder.Core;
using Wolder.CSharp.Actions;
using Wolder.CSharp.Compilation;
using Microsoft.Extensions.DependencyInjection;

namespace Wolder.CSharp;

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