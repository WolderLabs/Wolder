using Documentation.Generator;
using Documentation.Generator.Actions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wolder.Core;
using Wolder.CSharp.OpenAI;
using Wolder.CommandLine;
using Wolder.Core.Files;
using Wolder.Core.Workspace;
using Wolder.Interactive.Web;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

services.AddWolder(builder.Configuration.GetSection("Wolder"));

var host = builder.Build();

await host.Services.GetRequiredService<GeneratorWorkspaceBuilder>()
    .AddCommandLineActions()
    .AddCSharpGeneration()
    // .AddInteractiveWebServer()
    .AddActions<DocumentationActions>()
    .BuildWorkspaceAndRunAsync<GenerateDocs>("output");

class GenerateDocs(
    CommandLineActions commandLine,
    DocumentationActions documentation) : IVoidAction
{
    public async Task InvokeAsync()
    {
        await documentation.GenerateMarkdownPageAsync(
            new GenerateMarkdownPageParameters(
            "README.md", 
            "Given a collection of C# code samples from a Github project, generate an upbeat and engaging introduction " +
            "in Markdown format that highlights the key features, purpose, and potential impact of the project. " +
            "The introduction should be designed to attract new contributors, users, and stakeholders by showcasing " +
            "the project's innovation, ease of use, and the problem it solves. Include code snippets to demonstrate " +
            "the project's functionality, uniqueness, or a quick start guide for newcomers. Ensure the tone is " +
            "positive, welcoming, and highlights the collaborative effort behind the project. Also, provide a call " +
            "to action encouraging readers to contribute, provide feedback, or explore the project further." +
            "Project Name: Wolder",
            new FileMemoryItem("/src/Wolder.Generator.OpenAI/Program.cs", """
                using Microsoft.Extensions.DependencyInjection;
                using Microsoft.Extensions.Hosting;
                using Microsoft.Extensions.Logging;
                using Wolder.Core;
                using Wolder.CSharp;
                using Wolder.CSharp.OpenAI;
                using Wolder.CSharp.OpenAI.Actions;
                using Wolder.CommandLine;
                using Wolder.CommandLine.Actions;
                using Wolder.Core.Workspace;
                using Wolder.CSharp.CodeActions;
                using Wolder.Interactive.Web;

                var builder = Host.CreateApplicationBuilder();
                builder.Logging.AddConsole();

                var services = builder.Services;

                services.AddWolder(builder.Configuration.GetSection("Wolder"));

                var host = builder.Build();

                await host.Services.GetRequiredService<GeneratorWorkspaceBuilder>()
                    .AddCommandLineActions()
                    .AddCSharpGeneration()
                    .AddInteractiveWebServer()
                    .BuildWorkspaceAndRunAsync<GenerateFizzBuzz>("FizzBuzz.OpenAI.Output");

                class GenerateFizzBuzz(
                    CommandLineActions commandLine,
                    CSharpActions csharp,
                    CSharpGenerator csharpGenerator) : IVoidAction
                {
                    public async Task InvokeAsync()
                    {
                        await csharp.CreateSdkGlobalAsync(
                            new CreateSdkGlobalParameters(DotNetSdkVersion.Net8));
                        
                        var mainProject = new DotNetProjectReference("FizzBuzz/FizzBuzz.csproj", "FizzBuzz");
                        
                        await commandLine.ExecuteCommandLineAsync(
                            new ExecuteCommandLineParameters(
                                $"dotnet new console -n {mainProject.Name}"));

                        await csharpGenerator.GenerateClassAsync(
                            new GenerateClassParameters(
                                mainProject,
                                "",
                                "Program",
                                "A main method that implements the common fizz buzz app."));

                        await commandLine.ExecuteCommandLineAsync(
                            new ExecuteCommandLineParameters(
                                "dotnet run", mainProject.RelativeRoot));
                    }
                }
                """)));
    }
}
