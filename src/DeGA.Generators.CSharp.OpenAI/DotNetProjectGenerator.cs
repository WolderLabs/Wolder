using DeGA.Actions.CSharp.Compilation;
using DeGA.Core.Assistants;
using DeGA.Core.Files;
using Microsoft.CodeAnalysis;
using Microsoft.Extensions.Logging;

namespace DeGA.Generators.CSharp.OpenAI;

public class DotNetProjectGenerator(
    IAIAssistant assistant,
    ILogger<DotNetProjectGenerator> logger,
    DotNetProjectFactory projectFactory,
    ISourceFiles sourceFiles)
{
    public async Task<DotNetProject> CreateAsync(string name, string type)
    {
        var response = await assistant.CompletePromptAsync($"""
            You are a c# csproj generator. Output only a single csproj file, your 
            output will be directly written into a csproj file. 
            Create modern SDK style project files using dotnet 8 as the target framework.
            Enable implicit usings and nullable reference types.

            Create a csproj file for the following type of application: 
            {type}
            """);

        logger.LogInformation("Response from generate project prompt: \n{response}", response);

        var projectPath = await sourceFiles.WriteFileAsync(name, response);
        var projectReference = new DotNetProjectReference(projectPath);


        // Write a minimal program cs file so that it can build once
        var folder = Path.GetDirectoryName(name)!;
        await sourceFiles.WriteFileAsync(Path.Combine(folder, "Program.cs"), "Console.WriteLine();");

        var project = projectFactory.Create(projectReference);
        var success = await project.TryCompileAsync();
        if (!success)
        {
            throw new Exception("Could not compile");
        }
        return project;
    }
    
    public async Task<DotNetProject> CreateBlazorServerAppAsync(string name)
    {
        await sourceFiles.WriteFileAsync(
            "global.json", 
            """
            {
              "sdk": {
                "version": "8.0.100",
                "rollForward": "latestFeature"
              }
            }
            """);
        // await sourceFiles.RunCommandAsync(
        //     $"dotnet new blazor  -o {name} --interactivity server --empty");

        var path = Path.Combine(sourceFiles.RootDirectoryPath, $"{name}/{name}.csproj");
        var pathReference = new DotNetProjectReference(path);
        var project = projectFactory.Create(pathReference);
        var success = await project.TryCompileAsync();
        if (!success)
        {
            throw new Exception("Could not compile");
        }
        return project;
    }
}
