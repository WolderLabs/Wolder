using Microsoft.Extensions.Logging;
using System.Text.RegularExpressions;
using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.CSharp.Compilation;
using Wolder.Core.Workspace;

namespace Wolder.CSharp.OpenAI.Actions;

public record GenerateProjectParameters(string Name, string Prompt)
{
    public IEnumerable<FileMemoryItem> ContextMemoryItems { get; init; } = 
        Enumerable.Empty<FileMemoryItem>();
}

public class GenerateProject(
    IAIAssistant assistant,
    ILogger<GenerateClass> logger,
    CommandLineActions commandLineActions,
    ISourceFiles sourceFiles,
    GenerateProjectParameters parameters) 
    : IAction<GenerateProjectParameters, DotNetProjectReference>
{
    public async Task<DotNetProjectReference> InvokeAsync()
    {
        var commandResult = await assistant.CompletePromptAsync(
            $"You are a dotnet net8 project generator. Your only output should be a `dotnet new` " +
            $"CLI command that will create a dotnet project. Create a command that will create a project with name '{parameters.Name}' Project requirements: {parameters.Prompt}" +
            $"\n> ");
        await commandLineActions.ExecuteCommandLineAsync(
            new ExecuteCommandLineParameters(commandResult));
        return new DotNetProjectReference(parameters.Name, parameters.Name);
    }
}