using Wolder.Core;
using Wolder.CSharp.Actions;
using Wolder.CSharp.Compilation;
using Microsoft.Extensions.DependencyInjection;
using Wolder.Core.Workspace;

namespace Wolder.CSharp;

public static class ServiceCollectionExtensions
{
    public static GeneratorWorkspaceBuilder AddCSharpActions(this GeneratorWorkspaceBuilder builder)
    {
        builder.Services.AddScoped<DotNetProjectFactory>();
        builder.AddActions<CSharpActions>();
        
        return builder;
    }
}