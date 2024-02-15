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
    DotNetProjectFactory projectFactory,
    ISourceFiles sourceFiles,
    TransformClassParameters parameters) 
    : IAction<TransformClassParameters, FileMemoryItem>
{
    public async Task<FileMemoryItem> InvokeAsync()
    {
        var (projectRef, filePath, behaviorPrompt) = parameters;
        var content = await sourceFiles.ReadFileAsync(filePath);
        var response = await assistant.CompletePromptAsync($"""
            You are a helpful C# code generator. Output only C#, your output will be directly written to a `.cs` file.
            Write terse but helpful comments.

            Using the code from this file:
            File: {filePath}
            {content}

            Update the code with the following behavior:
            {behaviorPrompt}
            """);

        logger.LogInformation(response);

        var sanitized = Sanitize(response);

        logger.LogInformation(sanitized);

        await sourceFiles.WriteFileAsync(filePath, sanitized);


        var project = projectFactory.Create(projectRef);
        await project.TryCompileAsync();
        
        return new FileMemoryItem(filePath, sanitized);
    }
    
    private async Task SplitAndSaveFilesAsync(string input)
    {
        var sanitized = Sanitize(input);

        logger.LogInformation(sanitized);

        using (StringReader reader = new StringReader(sanitized))
        {
            StringBuilder fileContent = new StringBuilder();
            string? line;
            string? currentFileName = null;

            while ((line = reader.ReadLine()) != null)
            {
                if (line.Contains("=== START FILE:"))
                {
                    currentFileName = ExtractFileName(line);
                    fileContent.Clear();
                }
                else if (line.Contains("=== END FILE:"))
                {
                    if (currentFileName != null)
                    {
                        await sourceFiles.WriteFileAsync(currentFileName, fileContent.ToString());
                        currentFileName = null;
                    }
                }
                else if (currentFileName != null)
                {
                    fileContent.AppendLine(line);
                }
            }
        }
    }

    static string ExtractFileName(string line)
    {
        return line.Split(new string[] { "=== START FILE:" }, StringSplitOptions.None).Last().Trim();
    }
    
    private static string Sanitize(string input)
    {
        string pattern = @"^\s*```\s*csharp|^\s*```|^\s*```\s*html";
        string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

        return result;
    }
}