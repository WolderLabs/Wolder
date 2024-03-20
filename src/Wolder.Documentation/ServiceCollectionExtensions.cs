using Wolder.Core.Workspace;
using Wolder.OpenAI;

namespace Wolder.Documentation;

public static class GeneratorWorkspaceBuilderExtensions
{
    public static GeneratorWorkspaceBuilder AddDocumentationGeneration(this GeneratorWorkspaceBuilder builder)
    {
        builder.AddOpenAIAssistant();
        builder.AddActions<DocumentationActions>();
        
        return builder;
    }
}