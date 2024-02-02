using DeGA.Core;
using DeGA.CSharp.OpenAI.Actions;
using DeGA.OpenAI;

namespace DeGA.CSharp.OpenAI;

public static class ServiceCollectionExtensions
{
    public static DeGAServiceBuilder AddCSharpGeneration(this DeGAServiceBuilder builder)
    {
        builder.AddOpenAIAssistant();
        builder.AddCSharpActions();
        
        builder.AddAction<GenerateClass>();
        builder.AddAction<GenerateClasses>();
        builder.AddAction<TransformClass>();
        
        return builder;
    }
}