using DeGA.Core;
using DeGA.Generator.CSharp.Compilation;
using Microsoft.Extensions.Logging;

namespace DeGA.Generator.CSharp.Generators;

public class DotNetProjectGenerator(
    IAIAssistant assistant,
    ILogger<DotNetProjectGenerator> logger,
    DotNetProjectFactory projectFactory,
    GeneratorWorkspace workspace)
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

        var projectPath = await workspace.FileSystem.WriteFileAsync(name, response);


        // Write a minimal program cs file so that it can build once
        var folder = Path.GetDirectoryName(name)!;
        await workspace.FileSystem.WriteFileAsync(Path.Combine(folder, "Program.cs"), "Console.WriteLine();");

        var project = projectFactory.Create(projectPath);
        var success = await project.TryCompileAsync();
        if (!success)
        {
            throw new Exception("Could not compile");
        }
        return project;
    }
}
