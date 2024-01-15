using DeGA.Core;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.Extensions.Logging;

namespace DeGA.Generator.CSharp.LayerActions
{
    public record GenerateProjectOptions(string Name, string Type);

    public class GenerateProject : ILayerAction<GenerateProjectOptions>
    {
        private readonly IAIAssistant _assistant;
        private readonly ILogger<GenerateClass> _logger;
        private readonly GenerateProjectOptions _options;

        public GenerateProject(IAIAssistant assistant, ILogger<GenerateClass> logger, GenerateProjectOptions options)
        {
            _assistant = assistant;
            _logger = logger;
            _options = options;
        }

        public async Task InvokeAsync(Layer layer)
        {
            var response = await _assistant.CompletePromptAsync($"""
                You are a c# csproj generator. Output only a single csproj file, your 
                output will be directly written into a csproj file. 
                Create modern SDK style project files using dotnet 8 as the target framework.
                Enable implicit usings and nullable reference types. Omit a default namespace.


                Create a csproj file for the following type of application: {_options.Type}
                """);

            _logger.LogInformation("Response from generate project prompt: \n{response}", response);

            var projectPath = await layer.WriteFileAsync($"{_options.Name}.csproj", response);

            // Write a minimal program cs file so that it can build once
            await layer.WriteFileAsync($"Program.cs", "Console.WriteLine();");

            var msBuildInstance = MSBuildLocator.RegisterDefaults();

            // Create an instance of MSBuildWorkspace
            var workspace = MSBuildWorkspace.Create();

            // Open the project
            var project = await workspace.OpenProjectAsync(projectPath);

            // Compile the project
            var compilation = await project.GetCompilationAsync()
                ?? throw new InvalidOperationException("No compilation");

            // Handle errors and warnings
            foreach (var diagnostic in compilation.GetDiagnostics())
            {
                if (diagnostic.Severity == DiagnosticSeverity.Error)
                {
                    _logger.LogInformation($"Error: {diagnostic.GetMessage()}");
                }
                else if (diagnostic.Severity == DiagnosticSeverity.Warning)
                {
                    _logger.LogInformation($"Warning: {diagnostic.GetMessage()}");
                }
            }

            // Emit the compilation to a DLL or an executable
            var dllPath = layer.GetAbsolutePath($"{_options.Name}.dll");
            var result = compilation.Emit(dllPath);

            if (result.Success)
            {
                Console.WriteLine("Compilation successful!");
            }
            else
            {
                Console.WriteLine("Compilation failed.");
            }
        }
    }
}
