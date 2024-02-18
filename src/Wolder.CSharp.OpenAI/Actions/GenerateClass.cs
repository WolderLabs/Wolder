using System.Text.RegularExpressions;
using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.CSharp.Compilation;
using Microsoft.Extensions.Logging;
using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core.Workspace;
using Wolder.CSharp.Actions;

namespace Wolder.CSharp.OpenAI.Actions;

public record GenerateClassParameters(
    DotNetProjectReference Project, string Namespace, string ClassName, string BehaviorPrompt)
{
    public IEnumerable<FileMemoryItem> ContextMemoryItems { get; init; } = 
        Enumerable.Empty<FileMemoryItem>();
}

public class GenerateClass(
    IAIAssistant assistant,
    ILogger<GenerateClass> logger,
    CSharpActions csharp,
    ISourceFiles sourceFiles,
    GenerateClassParameters parameters) 
    : IAction<GenerateClassParameters, FileMemoryItem>
{
    public async Task<FileMemoryItem> InvokeAsync()
    {
        var (project, classNamespace, className, behaviorPrompt) = parameters;
        // Normalize the namespace to be relative to the project base namespace
        if (classNamespace.StartsWith(project.BaseNamespace))
        {
            classNamespace = classNamespace.Substring(project.BaseNamespace.Length);
        }
        
        var tree = sourceFiles.GetDirectoryTree();
        var context = $$"""
            Directory Tree:
            {{tree}}
            """;
        if (parameters.ContextMemoryItems.Any())
        {
            context = "\nThe items may also provide helpful context:\n" + 
                string.Join("\n", parameters.ContextMemoryItems
                    .Select(i => $"File: {i.RelativePath}\n{i.Content}" ));
        }

        var namespaceEnd = string.IsNullOrEmpty(classNamespace)
            ? ""
            : $".{classNamespace}";
        var response = await assistant.CompletePromptAsync($"""
            You are a C# code generator. Output only C#, your output will be directly written to a `.cs` file.
            Write terse but helpful explanatory comments.
            {context}

            Create a class named `{className}` with namespace `{project.BaseNamespace}{namespaceEnd}` with the following behavior:
            {behaviorPrompt}
            """);
        
        var classMemoryItem = await SanitizeAndWriteClassAsync(response);

        var result = await csharp.CompileProjectAsync(new(project));
        if (result is CompilationResult.Failure failure)
        {
            var (resolutionResult, fixedMemoryItem) = await TryResolveFailedCompilationAsync(project, classMemoryItem, failure, context);
            if (resolutionResult is CompilationResult.Failure)
            {
                throw new("Resolution failed");
            }
            else
            {
                return fixedMemoryItem ?? throw new NullReferenceException(nameof(fixedMemoryItem));
            }
        }

        return classMemoryItem;
    }

    private async Task<(CompilationResult, FileMemoryItem?)> TryResolveFailedCompilationAsync(
        DotNetProjectReference project, FileMemoryItem lastFile, CompilationResult lastResult, string context)
    {
        var (projectRef, classNamespace, className, behaviorPrompt) = parameters;
        var maxAttempts = 2;
        FileMemoryItem? classMemoryItem = null;
        for (int i = 0; i < maxAttempts; i++)
        {
            var diagnosticMessages = lastResult.Output.Errors;
            var messagesText = string.Join(Environment.NewLine, diagnosticMessages);
            var response = await assistant.CompletePromptAsync($"""
                You are a helpful assistant that writes C# code to complete any task specified by me. Your output will be directly written to a file where it will be compiled as part of a larger C# project.
                {context}

                Given the following compilation diagnostic messages transform the following file to resolve the messages:
                {messagesText}
                
                File Content:
                {lastFile.Content}
                """);
            
            classMemoryItem = await SanitizeAndWriteClassAsync(response);
            
            lastResult = await csharp.CompileProjectAsync(new(project));
            if (lastResult is CompilationResult.Success)
            {
                break;
            }
        }
        return (lastResult, classMemoryItem);
    }

    private async Task<FileMemoryItem> SanitizeAndWriteClassAsync(string response)
    {
        var (project, classNamespace, className, behaviorPrompt) = parameters;
        var sanitized = Sanitize(response);

        logger.LogInformation(sanitized);

        var relativePath = classNamespace.Replace('.', Path.PathSeparator);
        var path = Path.Combine(project.RelativeRoot, relativePath,  $"{className}.cs");
            
        await sourceFiles.WriteFileAsync(path, sanitized);
        
        return new FileMemoryItem(path, sanitized);
    }
    
    private static string Sanitize(string input)
    {
        string pattern = @"^\s*```\s*csharp|^\s*```|^\s*```\s*html";
        string result = Regex.Replace(input, pattern, "", RegexOptions.Multiline);

        return result;
    }
}