using System.Text;
using System.Text.RegularExpressions;
using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.CSharp.Compilation;
using Microsoft.Extensions.Logging;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.OpenAI.Actions;

public record TransformClassParameters(DotNetProjectReference project, string filePath, string behaviorPrompt);

public class TransformClass(
    IAIAssistant assistant,
    ILogger<TransformClass> logger,
    ISourceFiles sourceFiles,
    TransformClassParameters parameters) 
    : IAction<TransformClassParameters, FileMemoryItem>
{
    public async Task<FileMemoryItem> InvokeAsync()
    {
        var (projectRef, filePath, behaviorPrompt) = parameters;
        var content = await sourceFiles.ReadFileAsync(filePath);
        var response = await assistant.CompletePromptAsync($"""
            {GenerateClass.CSharpPrompt}

            Using the code from this file:
            File: {filePath}
            ```
            {content}
            ```

            Update the code with the following behavior:
            {behaviorPrompt}
            
            Begin Output:
            """);

        logger.LogInformation(response);

        var sanitized = Sanitize(response);

        logger.LogInformation(sanitized);

        await sourceFiles.WriteFileAsync(filePath, sanitized);

        return new FileMemoryItem(filePath, sanitized);
    }
    
    private static string Sanitize(string input)
    {
        string pattern = @"^\s*```\s*csharp|^\s*```|^\s*```\s*html";
        string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

        return result;
    }
}