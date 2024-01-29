using System.Text.RegularExpressions;
using DeGA.Core.Assistants;
using DeGA.Core.Files;
using DeGA.Core.Pipeline;
using DeGA.CSharp.Compilation;
using DeGA.CSharp.OpenAI.Generators;
using Microsoft.Extensions.Logging;

namespace DeGA.CSharp.OpenAI.Actions;

public record GenerateClass(DotNetProjectReference project, string classFullName, string behaviorPrompt)
    : IActionDefinition<GenerateClassAction>;

public class GenerateClassAction(
    IAIAssistant assistant,
    ILogger<CodeGenerator> logger,
    DotNetProjectFactory projectFactory,
    ISourceFiles sourceFiles) 
    : PipelineActionBase<GenerateClass>
{
    protected override async Task ExecuteAsync(IPipelineActionContext context, GenerateClass parameters)
    {
        var (projectRef, className, behaviorPrompt) = parameters;
        var response = await assistant.CompletePromptAsync($"""
            You are a C# code generator. Output only C#, your output will be directly written to a `.cs` file.
            Write terse but helpful explanatory comments.

            Create a class named `{className}` with the following behavior:
            {behaviorPrompt}
            """);
        var sanitized = Sanitize(response);

        logger.LogInformation(sanitized);

        var path = Path.Combine(projectRef.RelativeRoot, $"{className}.cs");

        await sourceFiles.WriteFileAsync(path, sanitized);

        var project = projectFactory.Create(projectRef);
        await project.TryCompileAsync();
    }
    
    private static string Sanitize(string input)
    {
        string pattern = @"^\s*```\s*csharp|^\s*```|^\s*```\s*html";
        string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

        return result;
    }
}