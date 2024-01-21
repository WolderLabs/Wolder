using DeGA.Core;
using DeGA.Generator.CSharp.Compilation;
using DeGA.Generator.CSharp.LayerActions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using System.Text.RegularExpressions;

namespace DeGA.Generator.CSharp.Generators;

public class CodeGenerator(
    DotNetProject project,
    IAIAssistant assistant,
    ILogger<CodeGenerator> logger,
    IWorkspaceFileSystem fileSystem)
{
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

        await fileSystem.WriteFileAsync(path, sanitized);

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
        string pattern = @"^\s*```\s*csharp|^\s*```";
        string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

        return result;
    }
}
