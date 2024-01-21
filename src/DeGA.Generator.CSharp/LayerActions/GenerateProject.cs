using DeGA.Core;
using DeGA.Generator.CSharp.Compilation;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace DeGA.Generator.CSharp.LayerActions
{
    //public record GenerateProjectOptions(string Name, string Type);

    //public class GenerateProject : IGeneratorAction<GenerateProjectOptions>
    //{
    //    private readonly IAIAssistant _assistant;
    //    private readonly ILogger<GenerateClass> _logger;
    //    private readonly GenerateProjectOptions _options;

    //    public GenerateProject(IAIAssistant assistant, ILogger<GenerateClass> logger, GenerateProjectOptions options)
    //    {
    //        _assistant = assistant;
    //        _logger = logger;
    //        _options = options;
    //    }

    //    public async Task InvokeAsync(Generator layer)
    //    {
    //        var response = await _assistant.CompletePromptAsync($"""
    //            You are a c# csproj generator. Output only a single csproj file, your 
    //            output will be directly written into a csproj file. 
    //            Create modern SDK style project files using dotnet 8 as the target framework.
    //            Enable implicit usings and nullable reference types.


    //            Create a csproj file for the following type of application: {_options.Type}
    //            """);

    //        _logger.LogInformation("Response from generate project prompt: \n{response}", response);

    //        var projectPath = await layer.WriteFileAsync($"{_options.Name}.csproj", response);

    //        // Write a minimal program cs file so that it can build once
    //        await layer.WriteFileAsync($"Program.cs", "Console.WriteLine();");

    //        var project = new CSharpProject(projectPath, new NullLogger<DotNetProject>());
    //        var success = await project.TryCompileAsync();
    //        if (!success)
    //        {
    //            throw new Exception("Could not compile");
    //        }
    //    }
    //}
}
