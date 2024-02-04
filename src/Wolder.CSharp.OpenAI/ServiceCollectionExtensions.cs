using Wolder.Core;
using Wolder.CSharp.OpenAI.Actions;
using Wolder.OpenAI;

namespace Wolder.CSharp.OpenAI;

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