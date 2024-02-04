using Wolder.Core;
using Wolder.CSharp.OpenAI.Actions;
using Wolder.OpenAI;

namespace Wolder.CSharp.OpenAI;

public static class ServiceCollectionExtensions
{
    public static WolderServiceBuilder AddCSharpGeneration(this WolderServiceBuilder builder)
    {
        builder.AddOpenAIAssistant();
        builder.AddCSharpActions();
        
        builder.AddAction<GenerateClass>();
        builder.AddAction<GenerateClasses>();
        builder.AddAction<TransformClass>();
        
        return builder;
    }
}