using System.Text;
using System.Text.RegularExpressions;
using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.CSharp.Compilation;
using Microsoft.Extensions.Logging;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.OpenAI.Actions;

public record TransformClass(DotNetProjectReference project, string filePath, string behaviorPrompt);

[GenerateTypedActionInvokeInterface<ITransoformClass>]
public class TransformClassAction(
    IAIAssistant assistant,
    ILogger<TransformClassAction> logger,
    DotNetProjectFactory projectFactory,
    ISourceFiles sourceFiles,
    TransformClass parameters) 
    : IVoidAction<TransformClass>
{
    public async Task InvokeAsync()
    {
        var (projectRef, filePath, behaviorPrompt) = parameters;
        var content = await sourceFiles.ReadFileAsync(filePath);
        var response = await assistant.CompletePromptAsync($"""
            You are a C# code generator. Output only C#, your output will be directly written to a `.cs` file.
            Write terse but helpful explanatory comments.
            Each file should always have a delimiter header like this:
            // === START FILE: ProjectName/Namespace/Namespace/ClassName.cs
            File contents
            // === END FILE: ProjectName/Namespace/Namespace/ClassName.cs

            Using the code from this file:
            === START FILE: {filePath}
            {content}
            === END FILE: {filePath}

            Update the code with the following behavior:
            {behaviorPrompt}
            """);

        logger.LogInformation(response);

        await SplitAndSaveFilesAsync(response);

        var project = projectFactory.Create(projectRef);
        await project.TryCompileAsync();
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