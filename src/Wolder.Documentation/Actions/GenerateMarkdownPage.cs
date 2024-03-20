using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.Core.Workspace;

namespace Wolder.Documentation.Actions;

public record GenerateMarkdownPageParameters(string Path, string Prompt, params FileMemoryItem[] MemoryItems);

public class GenerateMarkdownPage(
    ISourceFiles sourceFiles,
    IAIAssistant assistant,
    GenerateMarkdownPageParameters parameters) 
    : IVoidAction<GenerateMarkdownPageParameters>
{
    public async Task InvokeAsync()
    {
        var content = await assistant.CompletePromptAsync(
            "Given the subprompt provided below, generate a comprehensive response formatted exclusively in Markdown. " +
            "Ensure the response includes headings, lists, code blocks (if applicable), links, and any other relevant " +
            "Markdown elements to structure the information clearly and effectively. The response should be " +
            "well-organized, with a logical flow from introduction to conclusion, making it easy to read and understand. " +
            "Please adhere strictly to Markdown syntax to ensure the output can be directly copied and used in " +
            "Markdown-supported platforms.\n\n" +
            "Subprompt: \n" + parameters.Prompt +
            "Additional context: \n\n" +
            string.Join("\n", parameters.MemoryItems.Select(m => m.ToPromptText())));
        await sourceFiles.WriteFileAsync(parameters.Path, content);
    }
}
