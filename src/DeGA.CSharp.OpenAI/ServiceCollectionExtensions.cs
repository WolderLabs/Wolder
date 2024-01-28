using DeGA.Core;
using DeGA.CSharp.OpenAI.Generators;
using DeGA.OpenAI;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.CSharp.OpenAI;

public static class ServiceCollectionExtensions
{
    public static DeGAServiceBuilder AddCSharpGeneration(this DeGAServiceBuilder builder)
    {
        builder.AddOpenAIAssistant();
        builder.AddCSharpActions();
        
        builder.Services.AddTransient<CodeGeneratorFactory>();
        builder.Services.AddTransient<DotNetProjectGenerator>();
        
        return builder;
    }
}