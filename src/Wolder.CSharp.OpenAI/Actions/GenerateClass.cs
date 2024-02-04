using System.Text.RegularExpressions;
using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.Core.Pipeline;
using Wolder.CSharp.Compilation;
using Microsoft.Extensions.Logging;

namespace Wolder.CSharp.OpenAI.Actions;

public record GenerateClass(DotNetProjectReference project, string classFullName, string behaviorPrompt)
    : IActionDefinition<GenerateClassAction>;

public class GenerateClassAction(
    IAIAssistant assistant,
    ILogger<GenerateClassAction> logger,
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
        var result = await project.TryCompileAsync();
        if (result is CompilationResult.Failure failure)
        {
            var resolutionResult = await TryResolveFailedCompilationAsync(parameters, project, sanitized, failure);
            if (resolutionResult is CompilationResult.Failure)
            {
                throw new("Resolution failed");
            }
        }
    }

    private async Task<CompilationResult> TryResolveFailedCompilationAsync(
        GenerateClass parameters, DotNetProject project, string fileContent, CompilationResult lastResult)
    {
        var (projectRef, className, behaviorPrompt) = parameters;
        var maxAttempts = 2;
        for (int i = 0; i < maxAttempts; i++)
        {
            var diagnosticMessages = lastResult.Diagnostics.Select(d => d.GetMessage());
            var messagesText = string.Join(Environment.NewLine, diagnosticMessages);
            var response = await assistant.CompletePromptAsync($"""
                You are a helpful assistant that writes C# code to complete any task specified by me. Your output will be directly written to a file where it will be compiled as part of a larger C# project.

                Given the following compilation diagnostic messages transform the following file to resolve the messages:
                {messagesText}
                
                File Content:
                {fileContent}
                """);
            
            var sanitized = Sanitize(response);
            logger.LogInformation(sanitized);
            var path = Path.Combine(projectRef.RelativeRoot, $"{className}.cs");
            await sourceFiles.WriteFileAsync(path, sanitized);
            
            lastResult = await project.TryCompileAsync();
            if (lastResult is CompilationResult.Success)
            {
                break;
            }
        }
        return lastResult;
    }
    
    private static string Sanitize(string input)
    {
        string pattern = @"^\s*```\s*csharp|^\s*```|^\s*```\s*html";
        string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

        return result;
    }
}