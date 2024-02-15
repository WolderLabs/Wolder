using System.Text.RegularExpressions;
using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.CSharp.Compilation;
using Microsoft.Extensions.Logging;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.OpenAI.Actions;

public record GenerateRazorComponentParameters(
    DotNetProjectReference project,
    string classFullName,
    string behaviorPrompt)
{
    public IEnumerable<FileMemoryItem> ContextMemoryItems { get; set; } = 
        Enumerable.Empty<FileMemoryItem>();
}

public class GenerateRazorComponent(
    IAIAssistant assistant,
    ILogger<GenerateRazorComponentParameters> logger,
    DotNetProjectFactory projectFactory,
    ISourceFiles sourceFiles,
    GenerateRazorComponentParameters parameters) 
    : IAction<GenerateRazorComponentParameters, FileMemoryItem>
{
    public async Task<FileMemoryItem> InvokeAsync()
    {
        var (projectRef, className, behaviorPrompt) = parameters;
        var context = "";
        if (parameters.ContextMemoryItems.Any())
        {
            context = "\nUsing the following for context:\n" + 
                string.Join("\n", parameters.ContextMemoryItems
                    .Select(i => $"File: {i.RelativePath}\n{i.Content}" ));
        }
        var response = await assistant.CompletePromptAsync($"""
            You are a C# razor component generator. Output only C# and razor, your output will be directly written to a `.razor` file.
            Write terse but helpful comments.
            {context}

            Create a razor component named `{className}` with the following behavior:
            {behaviorPrompt}
            """);
        var sanitized = Sanitize(response);

        logger.LogInformation(sanitized);

        var path = Path.Combine(projectRef.RelativeRoot, $"{className}.razor");

        await sourceFiles.WriteFileAsync(path, sanitized);

        var project = projectFactory.Create(projectRef);
        // TODO: Not working with razor for some reason
        // var result = await project.TryCompileAsync();
        // if (result is CompilationResult.Failure failure)
        // {
        //     var resolutionResult = await TryResolveFailedCompilationAsync(project, sanitized, failure, context);
        //     if (resolutionResult is CompilationResult.Failure)
        //     {
        //         throw new("Resolution failed");
        //     }
        // }

        return new FileMemoryItem(path, sanitized);
    }

    private async Task<CompilationResult> TryResolveFailedCompilationAsync(
        DotNetProject project, string fileContent, CompilationResult lastResult, string context)
    {
        var (projectRef, className, behaviorPrompt) = parameters;
        var maxAttempts = 2;
        for (int i = 0; i < maxAttempts; i++)
        {
            var diagnosticMessages = lastResult.Diagnostics.Select(d => d.GetMessage());
            var messagesText = string.Join(Environment.NewLine, diagnosticMessages);
            var response = await assistant.CompletePromptAsync($"""
                You are a helpful assistant that writes C# razor component code to complete any task specified by me. Your output will be directly written to a file where it will be compiled as part of a larger C# project.
                {context}

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