using DeGA.Core;
using DeGA.Generator.CSharp.Compilation;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using System.Text;
using System.Text.RegularExpressions;

namespace DeGA.Generator.CSharp.Generators;

public class CodeGenerator(
    DotNetProject project,
    IAIAssistant assistant,
    ILogger<CodeGenerator> logger,
    GeneratorWorkspace workspace)
{
    public async Task CreateClassesAsync(string baseNamespace, string behaviorPrompt)
    {
        var response = await assistant.CompletePromptAsync($$"""
            You are a C# and razor code generator. The code you create will be compiled immediately and tested.
            Output only C# or razor files, your output will be directly written to one or more files. 
            Make sure using statements are added where necessary.
            Assume the files will be added to a single dotnet 8.0 project. The base namespace of the
            project is `{{baseNamespace}}`. 
            Each file should always have a delimiter header like this:

            // === START FILE: NamespaceComponent/ClassName.cs
            File contents
            // === END FILE: NamespaceComponent/ClassName.cs

            Create files that implement the following behavior:
            {{behaviorPrompt}}
            """);

        SplitAndSaveFiles(response);

        await TryCompileAsync();
    }

    private void SplitAndSaveFiles(string input)
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
                        workspace.FileSystem.WriteFileAsync(currentFileName, fileContent.ToString());
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

    public async Task CreateClassAsync(string className, string behaviorPrompt)
    {
        var response = await assistant.CompletePromptAsync($"""
            You are a C# code generator. Output only C#, your output will be directly written to a `.cs` file.
            Write terse but helpful explanatory comments.

            Create a class named `{className}` with the following behavior:
            {behaviorPrompt}
            """);
        var sanitized = Sanitize(response);

        logger.LogInformation(sanitized);

        var path = Path.Combine(project.BasePath, $"{className}.cs");

        await workspace.FileSystem.WriteFileAsync(path, sanitized);

        await TryCompileAsync();
    }

    private async Task TryCompileAsync()
    {
        var success = await project.TryCompileAsync();
        if (success)
        {
            logger.LogInformation("Can be compiled.");
        }
        else
        {
            logger.LogInformation("Can not be compiled.");
            throw new InvalidOperationException("Can't compile");
        }
    }

    private string Sanitize(string input)
    {
        string pattern = @"^\s*```\s*csharp|^\s*```|^\s*```\s*html";
        string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

        return result;
    }
}
