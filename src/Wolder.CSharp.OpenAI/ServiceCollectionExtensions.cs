using Wolder.Core;
using Wolder.Core.Workspace;
using Wolder.CSharp.OpenAI.Actions;
using Wolder.OpenAI;

namespace Wolder.CSharp.OpenAI;

public static class ServiceCollectionExtensions
{
    public static GeneratorWorkspaceBuilder AddCSharpGeneration(this GeneratorWorkspaceBuilder builder)
    {
        builder.AddOpenAIAssistant();
        builder.AddCSharpActions();
        
        builder.AddTypedActionInvoker<IGenerateClasses>();
        builder.AddTypedActionInvoker<IGenerateClass>();
        builder.AddTypedActionInvoker<ITransoformClass>();
        
        return builder;
    }
}